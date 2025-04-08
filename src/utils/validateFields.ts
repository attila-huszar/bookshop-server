export const validateEmail = (email?: string | null) => {
  if (!email) return false
  return /[A-Z0-9._%+-]+@[A-Z0-9-]+.+.[A-Z]{2,4}/gim.test(email)
}

export const validatePassword = (password?: string) => {
  if (!password) return false
  return /.{6,255}/.test(password)
}
