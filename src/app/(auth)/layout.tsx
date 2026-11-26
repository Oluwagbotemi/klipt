/** Sign-in, sign-up, password, invitation and welcome pages: one card on a soft page. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-shell flex min-h-dvh flex-col">
      <main id="main" className="flex flex-1 items-center justify-center sm:p-6">
        {children}
      </main>
    </div>
  );
}
