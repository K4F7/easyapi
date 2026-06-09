import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { OnboardingTour } from "@/components/onboarding-tour";
import { Toaster } from "@/components/ui/sonner";
import { getUserDisplayName } from "@/lib/auth/display-name";
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
      <DashboardShell username={getUserDisplayName(user)}>
        {children}
      </DashboardShell>
      <OnboardingTour />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
