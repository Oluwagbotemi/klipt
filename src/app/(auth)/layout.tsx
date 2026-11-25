/** Sign-in, sign-up, password, invitation and welcome pages: one card on a soft page. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-shell flex min-h-dvh flex-col">
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-3 py-3 sm:px-6 sm:py-6 lg:items-center"
      >
        {children}
      </main>
    </div>
  );
}
