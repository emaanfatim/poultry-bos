"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Transaction } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { KitchenTicket } from "../../components/sales/KitchenTicket";
import { useAuth } from "../../providers/AuthProvider";
import { fetchTransaction } from "../../services/sales";

export default function TicketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.id) return;
    fetchTransaction(token, params.id)
      .then(setTransaction)
      .catch(() => setError("Could not load order details."))
      .finally(() => setIsLoading(false));
  }, [token, params.id]);

  const handlePrint = () => {
    // Brief delay lets the browser paint the DOM before capturing it
    setTimeout(() => window.print(), 80);
  };

  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col print:min-h-0">
        {/* Header hidden when printing — ticket should be clean */}
        <div className="print:hidden">
          <Header />
        </div>

        <main className="flex-1 p-4 print:p-0">
          {isLoading && (
            <p className="text-center text-slate-500">Loading…</p>
          )}

          {error && (
            <div className="mx-auto max-w-sm rounded-xl bg-red-50 p-4 text-center text-red-700">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-3 text-sm font-medium underline"
              >
                Go back
              </button>
            </div>
          )}

          {transaction && (
            <KitchenTicket
              transaction={transaction}
              onPrint={handlePrint}
              onClose={() => router.back()}
            />
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
