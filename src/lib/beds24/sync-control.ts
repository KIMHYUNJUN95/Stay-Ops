function normalizeFlag(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isBeds24SyncPaused() {
  const flag = normalizeFlag(process.env.BEDS24_SYNC_PAUSED);
  if (!flag) {
    return false;
  }
  return flag !== "0" && flag !== "false" && flag !== "off" && flag !== "no";
}
