const REVIEW_HOST_HOME_ROLES = new Set(['admin', 'pastor', 'director-general'])

export function canReviewHostHomes(role: string | undefined): boolean {
  return role ? REVIEW_HOST_HOME_ROLES.has(role) : false
}
