export const ADMIN_EMAILS = ['juanjoselamarca@gmail.com']

export const isAdmin = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email)
