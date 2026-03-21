import { Suspense } from "react";
import ClientPage from "./page.client";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
      <ClientPage />
    </Suspense>
  );
}
