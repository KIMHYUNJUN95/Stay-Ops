const ROOM_ASSIGNMENT_SEPARATOR = "::room::";

export function toStoredReservationId(
  sourceReservationId: string,
  roomLabel: string,
) {
  const original = toOriginalReservationId(sourceReservationId);
  return `${original}${ROOM_ASSIGNMENT_SEPARATOR}${roomLabel}`;
}

export function toOriginalReservationId(value: string) {
  const separatorIndex = value.indexOf(ROOM_ASSIGNMENT_SEPARATOR);
  if (separatorIndex === -1) {
    return value;
  }
  return value.slice(0, separatorIndex);
}

export function hasStoredReservationRoomSuffix(value: string) {
  return value.includes(ROOM_ASSIGNMENT_SEPARATOR);
}
