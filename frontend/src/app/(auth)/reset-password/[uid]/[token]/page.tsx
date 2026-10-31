import { ResetForm } from "./ResetForm";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[uid]/[token]">) {
  const { uid, token } = await params;
  return <ResetForm uid={uid} token={token} />;
}
