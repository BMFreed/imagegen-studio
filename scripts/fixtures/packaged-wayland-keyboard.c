/* Test-only native input for the private virtual KWin launcher. */
#include <errno.h>
#include <limits.h>
#include <linux/input-event-codes.h>
#include <pwd.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <wayland-client.h>

static const char socket_name[] = "igs-chooser";
static const char compositor_exe[] = "/usr/bin/kwin_wayland";

/* Request order and signatures from KDE plasma-wayland-protocols fake-input.xml. */
enum { AUTHENTICATE, KEYBOARD_KEY = 10, INPUT_VERSION = 4 };
static const struct wl_message fake_input_requests[] = {
    {"authenticate", "ss", NULL},
    {"pointer_motion", "ff", NULL},
    {"button", "uu", NULL},
    {"axis", "uf", NULL},
    {"touch_down", "2uff", NULL},
    {"touch_motion", "2uff", NULL},
    {"touch_up", "2u", NULL},
    {"touch_cancel", "2", NULL},
    {"touch_frame", "2", NULL},
    {"pointer_motion_absolute", "3ff", NULL},
    {"keyboard_key", "4uu", NULL},
};
_Static_assert(KEYBOARD_KEY + 1 == sizeof(fake_input_requests) / sizeof(fake_input_requests[0]),
               "keyboard_key is the final request in v4");
static const struct wl_interface fake_input_interface = {
    "org_kde_kwin_fake_input", INPUT_VERSION,
    sizeof(fake_input_requests) / sizeof(fake_input_requests[0]), fake_input_requests,
    0, NULL,
};

static void require(bool condition, const char *message)
{
    if (!condition) {
        fprintf(stderr, "Private KWin keyboard: %s\n", message);
        exit(EXIT_FAILURE);
    }
}

static size_t read_process_file(const char *name, char *buffer, size_t size)
{
    FILE *file = fopen(name, "re");
    require(file != NULL, "cannot read process identity");
    size_t length = fread(buffer, 1, size - 1, file);
    require(feof(file) && !ferror(file) && length > 0, "incomplete process identity");
    fclose(file);
    buffer[length] = '\0';
    return length;
}

static void check_compositor(pid_t pid)
{
    char filename[64], canonical[PATH_MAX], peer[4096], current[4096];
    snprintf(filename, sizeof(filename), "/proc/%ld/exe", (long)pid);
    require(realpath(filename, canonical) && !strcmp(canonical, compositor_exe),
            "socket peer is not the installed KWin executable");
    snprintf(filename, sizeof(filename), "/proc/%ld/cgroup", (long)pid);
    read_process_file(filename, peer, sizeof(peer));
    read_process_file("/proc/self/cgroup", current, sizeof(current));
    require(!strcmp(peer, current), "socket peer is outside the test cgroup");
    snprintf(filename, sizeof(filename), "/proc/%ld/cmdline", (long)pid);
    size_t length = read_process_file(filename, peer, sizeof(peer));
    require(peer[length - 1] == '\0', "incomplete compositor command line");
    bool virtual = false, named_socket = false;
    for (const char *arg = peer; arg < peer + length; arg += strlen(arg) + 1) {
        virtual |= !strcmp(arg, "--virtual");
        if (!strcmp(arg, "--socket")) {
            const char *value = arg + strlen(arg) + 1;
            named_socket = value < peer + length && !strcmp(value, socket_name);
        }
    }
    require(virtual && named_socket, "socket peer is not the test's virtual compositor");
}

static int connect_private_socket(void)
{
    const char *runtime = getenv("XDG_RUNTIME_DIR");
    const char *name = getenv("WAYLAND_DISPLAY");
    const char *pid = getenv("IMAGEGEN_CHOOSER_KWIN_PID");
    require(getuid() == geteuid() && runtime && name && !strcmp(name, socket_name) &&
                pid && pid[0] >= '1' && pid[0] <= '9' && !getenv("WAYLAND_SOCKET") &&
                !getenv("DISPLAY"),
            "run through the private Wayland launcher");
    errno = 0;
    char *end;
    long expected_pid = strtol(pid, &end, 10);
    require(!errno && !*end && expected_pid > 1 && expected_pid <= INT_MAX,
            "invalid private compositor PID");

    struct passwd *account = getpwuid(getuid());
    char prefix[PATH_MAX], canonical[PATH_MAX];
    require(account != NULL, "cannot locate account artifact root");
    int prefix_length = snprintf(prefix, sizeof(prefix), "%s/.codex/artifacts/imagegen-studio/",
                                 account->pw_dir);
    require(prefix_length > 0 && (size_t)prefix_length < sizeof(prefix), "artifact root is too long");
    require(realpath(runtime, canonical) && !strcmp(canonical, runtime) &&
                !strncmp(runtime, prefix, (size_t)prefix_length) && runtime[prefix_length] == 'w' &&
                !strchr(runtime + prefix_length, '/'),
            "runtime is outside the launcher-owned artifact location");
    struct stat info;
    require(!lstat(runtime, &info) && S_ISDIR(info.st_mode) && (info.st_mode & 0777) == 0700 &&
                info.st_uid == getuid(), "runtime is not a private user-owned directory");

    struct sockaddr_un address = {.sun_family = AF_UNIX};
    int socket_length = snprintf(address.sun_path, sizeof(address.sun_path), "%s/%s", runtime,
                                 socket_name);
    require(socket_length > 0 && (size_t)socket_length < sizeof(address.sun_path) &&
                !lstat(address.sun_path, &info) && S_ISSOCK(info.st_mode) && info.st_uid == getuid(),
            "cannot locate the private user-owned Wayland socket");
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    require(fd >= 0 && !connect(fd, (struct sockaddr *)&address, sizeof(address)),
            "cannot connect to the private Wayland socket");
    struct ucred credential;
    socklen_t length = sizeof(credential);
    require(!getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &credential, &length) &&
                length == sizeof(credential) && credential.uid == getuid() &&
                credential.pid == expected_pid,
            "Wayland socket peer does not match the launcher PID and user");
    check_compositor(credential.pid);
    return fd;
}

struct registry_input {
    uint32_t id;
    uint32_t version;
};

static void global(void *opaque, struct wl_registry *registry, uint32_t id, const char *name,
                   uint32_t version)
{
    (void)registry;
    struct registry_input *input = opaque;
    if (!strcmp(fake_input_interface.name, name)) {
        require(!input->id, "multiple fake input globals");
        input->id = id;
        input->version = version;
    }
}

static void global_remove(void *opaque, struct wl_registry *registry, uint32_t id)
{
    (void)registry;
    struct registry_input *input = opaque;
    if (input->id == id) {
        input->id = 0;
    }
}

static void send_key(struct wl_proxy *input, uint32_t key, uint32_t state)
{
    wl_proxy_marshal(input, KEYBOARD_KEY, key, state);
}

int main(int argc, char **argv)
{
    require(argc == 2, "use --probe, --hold, Tab, shift+Tab, Return or Escape");
    const char *action = argv[1];
    bool probe = !strcmp(action, "--probe");
    bool hold = !strcmp(action, "--hold");
    bool shifted = !strcmp(action, "shift+Tab");
    uint32_t key = 0;
    if (shifted || !strcmp(action, "Tab")) {
        key = KEY_TAB;
    } else if (!strcmp(action, "Return")) {
        key = KEY_ENTER;
    } else if (!strcmp(action, "Escape")) {
        key = KEY_ESC;
    }
    require(probe || hold || key, "unsupported test key");
    alarm(5);
    struct wl_display *display = wl_display_connect_to_fd(connect_private_socket());
    require(display != NULL, "cannot initialize the Wayland client");
    struct wl_registry *registry = wl_display_get_registry(display);
    struct registry_input input = {0};
    static const struct wl_registry_listener registry_events = {global, global_remove};
    require(registry && !wl_registry_add_listener(registry, &registry_events, &input) &&
                wl_display_roundtrip(display) >= 0,
            "cannot read the Wayland protocol registry");
    require(input.id && input.version >= INPUT_VERSION,
            "the private desktop entry must grant the fake-input keyboard protocol");
    struct wl_proxy *fake_input = wl_registry_bind(registry, input.id, &fake_input_interface,
                                                   INPUT_VERSION);
    require(fake_input != NULL, "cannot bind the fake input protocol");
    wl_proxy_marshal(fake_input, AUTHENTICATE, "ImageGen Studio qualification",
                     "Send the test keys to the isolated Home and Recovery fixture");
    require(wl_display_roundtrip(display) >= 0, "compositor rejected the fake input connection");
    if (key) {
        if (shifted) {
            send_key(fake_input, KEY_LEFTSHIFT, WL_KEYBOARD_KEY_STATE_PRESSED);
        }
        send_key(fake_input, key, WL_KEYBOARD_KEY_STATE_PRESSED);
        send_key(fake_input, key, WL_KEYBOARD_KEY_STATE_RELEASED);
        if (shifted) {
            send_key(fake_input, KEY_LEFTSHIFT, WL_KEYBOARD_KEY_STATE_RELEASED);
        }
        require(wl_display_roundtrip(display) >= 0, "compositor rejected the keyboard request");
    }
    printf("{\"interface\":\"%s\",\"advertisedVersion\":%u,\"boundVersion\":%u,\"action\":\"%s\"}\n",
           fake_input_interface.name, input.version, INPUT_VERSION, action);
    if (hold) {
        require(!fflush(stdout), "cannot report initial keyboard readiness");
        alarm(0);
        // Preserve seat capability across all per-key clients until the launcher closes stdin.
        require(getchar() == EOF && !ferror(stdin), "hold control only accepts stdin closure");
    }
    wl_proxy_destroy(fake_input);
    wl_registry_destroy(registry);
    wl_display_disconnect(display);
    return EXIT_SUCCESS;
}
