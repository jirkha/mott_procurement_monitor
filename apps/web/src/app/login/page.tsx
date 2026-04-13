import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-16 text-slate-600">
          Načítání…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
