/**
 * Permission bitflags for guild-level actions.
 * Must match backend ChatApp.Core.Entities.Permissions enum.
 * Use (permissions & Permission.ManageChannels) !== 0 to check.
 */
export const Permissions = {
  None: 0n,
  ViewChannels: 1n,
  SendMessages: 2n,
  ManageChannels: 4n,
  ManageGuild: 8n,
  CreateInstantInvite: 16n,
  Administrator: 2147483648n // 1 << 31
} as const;

export type PermissionFlag = (typeof Permissions)[keyof typeof Permissions];

/**
 * Checks if a permission bitfield includes the given permission.
 * Administrator implies all permissions.
 */
export function hasPermission(bitfield: bigint | number, permission: bigint): boolean {
  const b = typeof bitfield === 'number' ? BigInt(bitfield) : bitfield;
  if ((b & Permissions.Administrator) !== 0n) return true;
  return (b & permission) !== 0n;
}
