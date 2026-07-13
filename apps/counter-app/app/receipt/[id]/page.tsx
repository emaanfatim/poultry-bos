"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Transaction } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { ReceiptPreview } from "../../components/sales/ReceiptPreview";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchTransaction } from "../../services/sales";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useI18n();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token || !params.id) return;
    fetchTransaction(token, params.id)
      .then(setTransaction)
      .finally(() => setIsLoading(false));
  }, [token, params.id]);

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4">
          {isLoading && <p className="text-center">{t.common.loading}</p>}
          {transaction && (
            <ReceiptPreview
              transaction={transaction}
              onPrint={() => window.print()}
              onNewSale={() => router.push("/pos")}
            />
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
