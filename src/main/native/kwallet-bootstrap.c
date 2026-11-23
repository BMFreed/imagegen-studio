/*
 * Prepare the first conventional KWallet through KDE's Secret Service endpoint.
 * This process receives no credentials and emits only a stable exit status.
 */
#include <gio/gio.h>
#include <glib-unix.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

#define BUS_NAME "org.freedesktop.DBus"
#define BUS_PATH "/org/freedesktop/DBus"
#define KDE_SERVICE "org.kde.secretservicecompat"
#define KDE_DAEMON "org.kde.ksecretd"
#define KDE_COMPAT "org.kde.kwalletd6"
#define KWALLET_INTERFACE "org.kde.KWallet"
#define KWALLET_PATH "/modules/kwalletd6"
#define SECRET_PATH "/org/freedesktop/secrets"
#define SECRET_INTERFACE "org.freedesktop.Secret.Service"
#define PROMPT_INTERFACE "org.freedesktop.Secret.Prompt"
#define PROMPT_PREFIX SECRET_PATH "/prompt/p"
#define COLLECTION_PREFIX SECRET_PATH "/collection/"
#define DEFAULT_WALLET "kdewallet"
#define DEFAULT_COLLECTION COLLECTION_PREFIX DEFAULT_WALLET

enum ExitStatus {
    READY = 0,
    CANCELLED = 2,
    TIMED_OUT = 3,
    UNAVAILABLE = 4,
};

enum {
    REQUEST_BUDGET_MS = 60000,
    BUS_CALL_MAX_MS = 4000,
    DISMISS_MAX_MS = 1000,
};

typedef struct {
    GMainLoop *loop;
    GCancellable *connect_cancel;
    GDBusConnection *bus;
    gboolean connecting;
    gboolean interrupted;
    gboolean timed_out;
    gboolean owner_changed;
    gboolean bus_closed;
    gboolean prompt_completed;
    gboolean prompt_dismissed;
    gchar *prompt_result;
    gint64 deadline;
    guint deadline_source;
} Bootstrap;

static void stop_wait(Bootstrap *state)
{
    if (state->connecting) {
        g_cancellable_cancel(state->connect_cancel);
    } else {
        g_main_loop_quit(state->loop);
    }
}

static gboolean on_deadline(gpointer user_data)
{
    Bootstrap *state = user_data;
    state->deadline_source = 0;
    state->timed_out = TRUE;
    stop_wait(state);
    return G_SOURCE_REMOVE;
}

static gboolean on_interruption(gpointer user_data)
{
    Bootstrap *state = user_data;
    state->interrupted = TRUE;
    stop_wait(state);
    return G_SOURCE_CONTINUE;
}

static void on_bus_connected(GObject *source, GAsyncResult *result, gpointer user_data)
{
    Bootstrap *state = user_data;
    (void)source;
    state->bus = g_dbus_connection_new_for_address_finish(result, NULL);
    state->connecting = FALSE;
    g_main_loop_quit(state->loop);
}

static void on_bus_closed(GDBusConnection *connection, gboolean remote, GError *error,
                          gpointer user_data)
{
    Bootstrap *state = user_data;
    (void)connection;
    (void)remote;
    (void)error;
    state->bus_closed = TRUE;
    stop_wait(state);
}

static gboolean observe_stop(Bootstrap *state)
{
    while (g_main_context_iteration(NULL, FALSE)) {
        if (state->interrupted || state->timed_out || state->owner_changed || state->bus_closed) {
            break;
        }
    }
    state->timed_out |= g_get_monotonic_time() >= state->deadline;
    return state->interrupted || state->timed_out || state->owner_changed || state->bus_closed;
}

static GVariant *call(Bootstrap *state, const gchar *destination, const gchar *path,
                      const gchar *interface, const gchar *method, GVariant *parameters,
                      const GVariantType *reply_type, GError **error)
{
    g_autoptr(GVariant) arguments = parameters ? g_variant_ref_sink(parameters) : NULL;
    if (observe_stop(state)) {
        return NULL;
    }
    gint64 remaining_us = state->deadline - g_get_monotonic_time();
    gint timeout = (gint)MIN(BUS_CALL_MAX_MS, MAX(1, (remaining_us + 999) / 1000));
    return g_dbus_connection_call_sync(
        state->bus, destination, path, interface, method, arguments, reply_type,
        G_DBUS_CALL_FLAGS_NO_AUTO_START, timeout, NULL, error);
}

static gboolean same_user_bus(GDBusConnection *bus)
{
    if (!bus) {
        return FALSE;
    }
    GIOStream *stream = g_dbus_connection_get_stream(bus);
    if (!G_IS_SOCKET_CONNECTION(stream)) {
        return FALSE;
    }
    GSocket *socket = g_socket_connection_get_socket(G_SOCKET_CONNECTION(stream));
    if (g_socket_get_family(socket) != G_SOCKET_FAMILY_UNIX) {
        return FALSE;
    }
    g_autoptr(GCredentials) credentials = g_socket_get_credentials(socket, NULL);
    return credentials && g_credentials_get_unix_user(credentials, NULL) == getuid();
}

static gboolean activate_service(Bootstrap *state, const gchar *name)
{
    g_autoptr(GVariant) reply = call(state, BUS_NAME, BUS_PATH, BUS_NAME, "StartServiceByName",
                                    g_variant_new("(su)", name, 0u), G_VARIANT_TYPE("(u)"), NULL);
    if (!reply) {
        return FALSE;
    }
    guint32 result;
    g_variant_get(reply, "(u)", &result);
    return result == 1 || result == 2;
}

static gchar *service_owner(Bootstrap *state, const gchar *name, GError **error)
{
    g_autoptr(GVariant) reply = call(state, BUS_NAME, BUS_PATH, BUS_NAME, "GetNameOwner",
                                    g_variant_new("(s)", name), G_VARIANT_TYPE("(s)"), error);
    if (!reply) {
        return NULL;
    }
    const gchar *owner;
    g_variant_get(reply, "(&s)", &owner);
    return g_dbus_is_unique_name(owner) ? g_strdup(owner) : NULL;
}

static gboolean same_owner(Bootstrap *state, const gchar *name, const gchar *owner)
{
    g_autofree gchar *actual = service_owner(state, name, NULL);
    return actual && g_str_equal(actual, owner);
}

static gboolean service_absent(Bootstrap *state, const gchar *name)
{
    g_autoptr(GError) error = NULL;
    g_autofree gchar *owner = service_owner(state, name, &error);
    return !owner && g_error_matches(error, G_DBUS_ERROR, G_DBUS_ERROR_NAME_HAS_NO_OWNER);
}

static gchar *find_or_activate_service(Bootstrap *state, const gchar *name)
{
    g_autoptr(GError) error = NULL;
    gchar *owner = service_owner(state, name, &error);
    if (owner) {
        return owner;
    }
    if (!g_error_matches(error, G_DBUS_ERROR, G_DBUS_ERROR_NAME_HAS_NO_OWNER) ||
        !activate_service(state, name)) {
        return NULL;
    }
    return service_owner(state, name, NULL);
}

static gboolean same_user_service(Bootstrap *state, const gchar *owner)
{
    g_autoptr(GVariant) reply = call(state, BUS_NAME, BUS_PATH, BUS_NAME,
                                    "GetConnectionUnixUser", g_variant_new("(s)", owner),
                                    G_VARIANT_TYPE("(u)"), NULL);
    if (!reply) {
        return FALSE;
    }
    guint32 uid;
    g_variant_get(reply, "(u)", &uid);
    return uid == getuid();
}

static void on_owner_changed(GDBusConnection *connection, const gchar *sender,
                             const gchar *path, const gchar *interface, const gchar *signal,
                             GVariant *parameters, gpointer user_data)
{
    Bootstrap *state = user_data;
    (void)connection;
    (void)sender;
    (void)path;
    (void)interface;
    (void)signal;
    (void)parameters;
    state->owner_changed = TRUE;
    stop_wait(state);
}

static gboolean collection_path(const gchar *path)
{
    return g_str_has_prefix(path, COLLECTION_PREFIX) &&
           path[sizeof(COLLECTION_PREFIX) - 1] != '\0' &&
           !strchr(path + sizeof(COLLECTION_PREFIX) - 1, '/');
}

static gboolean prompt_path(const gchar *path)
{
    if (!g_str_has_prefix(path, PROMPT_PREFIX)) {
        return FALSE;
    }
    const gchar *digit = path + sizeof(PROMPT_PREFIX) - 1;
    if (*digit == '\0') {
        return FALSE;
    }
    for (; *digit; ++digit) {
        if (!g_ascii_isdigit(*digit)) {
            return FALSE;
        }
    }
    return TRUE;
}

typedef enum {
    SNAPSHOT_UNAVAILABLE,
    SNAPSHOT_EMPTY,
    SNAPSHOT_DEFAULT_EXISTS,
} WalletSnapshot;

static WalletSnapshot read_wallets(Bootstrap *state, const gchar *owner, gboolean verify_created)
{
    g_autoptr(GVariant) alias = call(state, owner, SECRET_PATH, SECRET_INTERFACE, "ReadAlias",
                                    g_variant_new("(s)", "default"), G_VARIANT_TYPE("(o)"), NULL);
    g_autoptr(GVariant) list = call(
        state, owner, SECRET_PATH, "org.freedesktop.DBus.Properties", "Get",
        g_variant_new("(ss)", SECRET_INTERFACE, "Collections"), G_VARIANT_TYPE("(v)"), NULL);
    if (!alias || !list || !same_owner(state, KDE_SERVICE, owner) || observe_stop(state)) {
        return SNAPSHOT_UNAVAILABLE;
    }

    const gchar *default_path;
    g_variant_get(alias, "(&o)", &default_path);
    g_autoptr(GVariant) wrapper = g_variant_get_child_value(list, 0);
    g_autoptr(GVariant) collections = g_variant_get_variant(wrapper);
    if (!g_variant_is_of_type(collections, G_VARIANT_TYPE("ao"))) {
        return SNAPSHOT_UNAVAILABLE;
    }

    GVariantIter iter;
    g_variant_iter_init(&iter, collections);
    const gchar *path;
    gboolean found_default = FALSE;
    while (g_variant_iter_next(&iter, "&o", &path)) {
        if (!collection_path(path)) {
            return SNAPSHOT_UNAVAILABLE;
        }
        found_default |= g_str_equal(path, default_path);
    }

    gsize count = g_variant_n_children(collections);
    if (found_default && (!verify_created ||
                          (count == 1 && g_str_equal(default_path, DEFAULT_COLLECTION)))) {
        return SNAPSHOT_DEFAULT_EXISTS;
    }
    if (!verify_created && count == 0 && g_str_equal(default_path, "/")) {
        return SNAPSHOT_EMPTY;
    }
    return SNAPSHOT_UNAVAILABLE;
}

static gboolean default_wallet_name(GVariant *reply)
{
    if (!reply) {
        return FALSE;
    }
    const gchar *name;
    g_variant_get(reply, "(&s)", &name);
    return g_str_equal(name, DEFAULT_WALLET);
}

static gboolean legacy_default_exists(Bootstrap *state)
{
    // Older and externally backed KWallet installations may have no KDE
    // Secret Service. Inspect an existing legacy owner without starting it.
    if (!service_absent(state, KDE_SERVICE)) {
        return FALSE;
    }
    g_autofree gchar *owner = service_owner(state, KDE_COMPAT, NULL);
    if (!owner || !same_user_service(state, owner)) {
        return FALSE;
    }
    g_autoptr(GVariant) network = call(state, owner, KWALLET_PATH, KWALLET_INTERFACE,
                                      "networkWallet", NULL, G_VARIANT_TYPE("(s)"), NULL);
    g_autoptr(GVariant) wallets = call(state, owner, KWALLET_PATH, KWALLET_INTERFACE,
                                      "wallets", NULL, G_VARIANT_TYPE("(as)"), NULL);
    if (!network || !wallets || !same_owner(state, KDE_COMPAT, owner) ||
        !service_absent(state, KDE_SERVICE) || observe_stop(state)) {
        return FALSE;
    }
    const gchar *requested;
    g_variant_get(network, "(&s)", &requested);
    if (!*requested) {
        return FALSE;
    }
    g_autoptr(GVariant) names = g_variant_get_child_value(wallets, 0);
    GVariantIter iter;
    g_variant_iter_init(&iter, names);
    const gchar *name;
    while (g_variant_iter_next(&iter, "&s", &name)) {
        if (g_str_equal(name, requested)) {
            return TRUE;
        }
    }
    return FALSE;
}

static gboolean check_wallet_settings(Bootstrap *state, const gchar *owner,
                                      gchar **compat_owner, gboolean recheck)
{
    if (!same_owner(state, KDE_DAEMON, owner)) {
        return FALSE;
    }
    g_autoptr(GError) error = NULL;
    g_autoptr(GVariant) direct = call(state, owner, "/ksecretd", KWALLET_INTERFACE,
                                      "localWallet", NULL, G_VARIANT_TYPE("(s)"), &error);
    if (direct) {
        if (*compat_owner || !default_wallet_name(direct)) {
            return FALSE;
        }
        // Older KDE exposes both effective names on the Secret Service daemon.
        g_autoptr(GVariant) network = call(state, owner, "/ksecretd", KWALLET_INTERFACE,
                                          "networkWallet", NULL, G_VARIANT_TYPE("(s)"), NULL);
        return default_wallet_name(network);
    }

    if ((!*compat_owner && recheck) || !error ||
        !(g_error_matches(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_METHOD) ||
          g_error_matches(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_INTERFACE))) {
        return FALSE;
    }

    // Newer KDE exposes the backend's effective local name via kwalletd6.
    // Its normal native-backend startup bypasses third-party migration.
    if (!recheck) {
        *compat_owner = find_or_activate_service(state, KDE_COMPAT);
        if (!*compat_owner || !same_user_service(state, *compat_owner)) {
            return FALSE;
        }
    }
    if (!same_owner(state, KDE_COMPAT, *compat_owner)) {
        return FALSE;
    }
    g_autoptr(GVariant) local = call(state, *compat_owner, KWALLET_PATH, KWALLET_INTERFACE,
                                    "localWallet", NULL, G_VARIANT_TYPE("(s)"), NULL);
    return default_wallet_name(local) && same_owner(state, KDE_COMPAT, *compat_owner);
}

static void on_prompt_completed(GDBusConnection *connection, const gchar *sender,
                                const gchar *path, const gchar *interface, const gchar *signal,
                                GVariant *parameters, gpointer user_data)
{
    Bootstrap *state = user_data;
    (void)connection;
    (void)sender;
    (void)path;
    (void)interface;
    (void)signal;
    if (state->prompt_completed) {
        return;
    }

    state->prompt_completed = TRUE;
    if (g_variant_is_of_type(parameters, G_VARIANT_TYPE("(bv)"))) {
        g_autoptr(GVariant) value = NULL;
        g_variant_get(parameters, "(b@v)", &state->prompt_dismissed, &value);
        g_autoptr(GVariant) result = g_variant_get_variant(value);
        if (g_variant_is_of_type(result, G_VARIANT_TYPE_OBJECT_PATH)) {
            state->prompt_result = g_variant_dup_string(result, NULL);
        }
    }
    g_main_loop_quit(state->loop);
}

static void dismiss_prompt(Bootstrap *state, const gchar *owner, const gchar *path)
{
    if (state->owner_changed || state->bus_closed) {
        return;
    }
    // This is scoped to the original unique owner and its returned prompt path.
    // KDE can still finish a native transaction after dropping its D-Bus prompt.
    g_autoptr(GVariant) reply = g_dbus_connection_call_sync(
        state->bus, owner, path, PROMPT_INTERFACE, "Dismiss", NULL, G_VARIANT_TYPE_UNIT,
        G_DBUS_CALL_FLAGS_NO_AUTO_START, DISMISS_MAX_MS, NULL, NULL);
    (void)reply;
}

static enum ExitStatus create_default_wallet(Bootstrap *state, const gchar *owner)
{
    g_autofree gchar *compat_owner = NULL;
    if (!check_wallet_settings(state, owner, &compat_owner, FALSE) ||
        read_wallets(state, owner, FALSE) != SNAPSHOT_EMPTY) {
        return UNAVAILABLE;
    }
    GVariantBuilder properties;
    g_variant_builder_init(&properties, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&properties, "{sv}", "org.freedesktop.Secret.Collection.Label",
                          g_variant_new_string(DEFAULT_WALLET));
    // An empty alias keeps the request scoped to creation. KDE owns its native
    // first-use behavior, and readiness is checked against the resulting alias.
    g_autoptr(GVariant) created = call(
        state, owner, SECRET_PATH, SECRET_INTERFACE, "CreateCollection",
        g_variant_new("(a{sv}s)", &properties, ""), G_VARIANT_TYPE("(oo)"), NULL);
    if (!created) {
        return UNAVAILABLE;
    }
    const gchar *collection, *prompt;
    g_variant_get(created, "(&o&o)", &collection, &prompt);
    if (!g_str_equal(collection, "/") || !prompt_path(prompt)) {
        return UNAVAILABLE;
    }
    if (!check_wallet_settings(state, owner, &compat_owner, TRUE) ||
        read_wallets(state, owner, FALSE) != SNAPSHOT_EMPTY) {
        dismiss_prompt(state, owner, prompt);
        return UNAVAILABLE;
    }

    guint subscription = g_dbus_connection_signal_subscribe(
        state->bus, owner, PROMPT_INTERFACE, "Completed", prompt, NULL, G_DBUS_SIGNAL_FLAGS_NONE,
        on_prompt_completed, state, NULL);
    g_autoptr(GVariant) response = call(state, owner, prompt, PROMPT_INTERFACE, "Prompt",
                                       g_variant_new("(s)", ""), G_VARIANT_TYPE_UNIT, NULL);
    if (response && !observe_stop(state) && !state->prompt_completed) {
        g_main_loop_run(state->loop);
    }
    g_dbus_connection_signal_unsubscribe(state->bus, subscription);
    if (!state->prompt_completed) {
        dismiss_prompt(state, owner, prompt);
        return UNAVAILABLE;
    }
    if (observe_stop(state)) {
        return UNAVAILABLE;
    }
    if (state->prompt_dismissed) {
        return CANCELLED;
    }
    if (!response || !state->prompt_result ||
        !g_str_equal(state->prompt_result, DEFAULT_COLLECTION)) {
        return UNAVAILABLE;
    }
    return read_wallets(state, owner, TRUE) == SNAPSHOT_DEFAULT_EXISTS ? READY : UNAVAILABLE;
}

static enum ExitStatus prepare_wallet(Bootstrap *state)
{
    g_autofree gchar *owner = service_owner(state, KDE_SERVICE, NULL);
    if (!owner) {
        if (legacy_default_exists(state)) {
            return READY;
        }
        owner = find_or_activate_service(state, KDE_SERVICE);
    }
    if (!owner || !same_user_service(state, owner)) {
        return UNAVAILABLE;
    }

    guint owner_subscription = g_dbus_connection_signal_subscribe(
        state->bus, BUS_NAME, BUS_NAME, "NameOwnerChanged", BUS_PATH, KDE_SERVICE,
        G_DBUS_SIGNAL_FLAGS_NONE, on_owner_changed, state, NULL);
    WalletSnapshot snapshot = read_wallets(state, owner, FALSE);
    enum ExitStatus result = UNAVAILABLE;
    if (snapshot == SNAPSHOT_DEFAULT_EXISTS) {
        result = READY;
    } else if (snapshot == SNAPSHOT_EMPTY) {
        result = create_default_wallet(state, owner);
    }
    g_dbus_connection_signal_unsubscribe(state->bus, owner_subscription);
    return result;
}

int main(int argc, char **argv)
{
    (void)argv;
    if (argc != 1) {
        return UNAVAILABLE;
    }
    const gchar *address = g_getenv("DBUS_SESSION_BUS_ADDRESS");
    if (!address || !g_str_has_prefix(address, "unix:") || strchr(address, ';') ||
        !g_dbus_is_address(address)) {
        return UNAVAILABLE;
    }

    g_autoptr(GMainLoop) loop = g_main_loop_new(NULL, FALSE);
    g_autoptr(GCancellable) cancel = g_cancellable_new();
    Bootstrap state = {
        .loop = loop,
        .connect_cancel = cancel,
        .connecting = TRUE,
        .deadline = g_get_monotonic_time() + (gint64)REQUEST_BUDGET_MS * 1000,
    };
    state.deadline_source = g_timeout_add(REQUEST_BUDGET_MS, on_deadline, &state);
    guint term_source = g_unix_signal_add(SIGTERM, on_interruption, &state);
    guint int_source = g_unix_signal_add(SIGINT, on_interruption, &state);

    g_dbus_connection_new_for_address(
        address, G_DBUS_CONNECTION_FLAGS_AUTHENTICATION_CLIENT |
                     G_DBUS_CONNECTION_FLAGS_MESSAGE_BUS_CONNECTION,
        NULL, cancel, on_bus_connected, &state);
    g_main_loop_run(loop);

    enum ExitStatus result = UNAVAILABLE;
    if (!observe_stop(&state) && same_user_bus(state.bus)) {
        g_dbus_connection_set_exit_on_close(state.bus, FALSE);
        g_signal_connect(state.bus, "closed", G_CALLBACK(on_bus_closed), &state);
        result = prepare_wallet(&state);
    }
    observe_stop(&state);
    if (state.interrupted) {
        result = CANCELLED;
    } else if (state.timed_out) {
        result = TIMED_OUT;
    } else if (state.owner_changed || state.bus_closed) {
        result = UNAVAILABLE;
    }

    if (state.deadline_source) {
        g_source_remove(state.deadline_source);
    }
    g_source_remove(term_source);
    g_source_remove(int_source);
    if (state.bus) {
        g_signal_handlers_disconnect_by_data(state.bus, &state);
        g_object_unref(state.bus);
    }
    g_free(state.prompt_result);
    return result;
}
