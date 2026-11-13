/** Main owns the captured target. No filesystem capability crosses IPC. */
export interface ModelRemovalReview {
  fileCount: number
  name: string
  resourceId: string
  sharedFileCount: number
  token: string
  versionCount: number
}

export function isModelRemovalId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
}

export function isModelRemovalReview(value: unknown): value is ModelRemovalReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const review = value as Record<string, unknown>
  return (
    Object.keys(review).sort().join(',') ===
      'fileCount,name,resourceId,sharedFileCount,token,versionCount' &&
    isModelRemovalId(review['resourceId']) &&
    isModelRemovalId(review['token']) &&
    typeof review['name'] === 'string' &&
    review['name'].length > 0 &&
    Number.isSafeInteger(review['versionCount']) &&
    (review['versionCount'] as number) > 0 &&
    Number.isSafeInteger(review['fileCount']) &&
    (review['fileCount'] as number) >= 0 &&
    Number.isSafeInteger(review['sharedFileCount']) &&
    (review['sharedFileCount'] as number) >= 0 &&
    (review['sharedFileCount'] as number) <= (review['fileCount'] as number)
  )
}
