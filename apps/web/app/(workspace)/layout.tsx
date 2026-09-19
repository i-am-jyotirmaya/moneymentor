import { Suspense } from "react";
import { MoneyMentorHome } from "../_components/money-mentor-home";
import { WorkspaceSkeleton } from "../_components/loading-ui";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <MoneyMentorHome>{children}</MoneyMentorHome>
    </Suspense>
  );
}
