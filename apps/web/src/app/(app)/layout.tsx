import { AppShell } from "@/components/app-shell";
import { getSessionUser, isAuthEnabled } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = isAuthEnabled() ? await getSessionUser() : null;

  return (
    <AppShell
      user={
        session
          ? { username: session.username, role: session.role }
          : null
      }
    >
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
        {children}
      </div>
    </AppShell>
  );
}
