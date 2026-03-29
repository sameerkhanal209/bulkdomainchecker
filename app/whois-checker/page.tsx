import { Suspense } from "react";
import WhoisCheckerClient from "./whois-checker-client";

export default function WhoisCheckerPage() {
  return (
    <Suspense fallback={null}>
      <WhoisCheckerClient />
    </Suspense>
  );
}
