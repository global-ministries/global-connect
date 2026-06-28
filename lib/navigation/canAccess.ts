export function canAccess(
  item: { roles?: string[]; capabilities?: string[] },
  credentials: { roles: string[]; supportCapabilities: string[] }
): boolean {
  const hasRole = !item.roles || item.roles.some((role) => credentials.roles.includes(role))
  const hasCapability = !item.capabilities || item.capabilities.some((capability) => credentials.supportCapabilities.includes(capability))
  return hasRole && hasCapability
}
