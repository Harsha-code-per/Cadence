export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl p-4 md:p-6">{children}</main>;
}
