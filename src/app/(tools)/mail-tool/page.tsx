import { redirect } from 'next/navigation'

/** Keep shared links working while using the admin's existing sign-in flow. */
export default function MailToolPage() {
  redirect('/admin/mail-tool')
}
