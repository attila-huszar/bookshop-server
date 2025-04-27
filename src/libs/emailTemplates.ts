import mjml2html from 'mjml'
import verification from '../assets/emailTemplates/verification.mjml' with { type: 'text' }
import passwordReset from '../assets/emailTemplates/passwordReset.mjml' with { type: 'text' }

function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(
    /{{\s*(\w+)\s*}}/g,
    (_, key: string) => vars[key] ?? '',
  )
}

export function verificationEmail({
  toName,
  tokenLink,
  baseLink,
  logo,
}: {
  toName: string
  tokenLink: string
  baseLink: string
  logo: string
}) {
  const mjmlString = interpolate(verification, {
    toName,
    tokenLink,
    baseLink,
    logo,
  })

  return mjml2html(mjmlString)
}

export function passwordResetEmail({
  toName,
  tokenLink,
  baseLink,
  logo,
}: {
  toName: string
  tokenLink: string
  baseLink: string
  logo: string
}) {
  const mjmlString = interpolate(passwordReset, {
    toName,
    tokenLink,
    baseLink,
    logo,
  })

  return mjml2html(mjmlString)
}
