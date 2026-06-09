import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { OnboardingTour } from "@/components/onboarding-tour";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <DashboardShell email={user.email}>{children}</DashboardShell>
      <OnboardingTour />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
