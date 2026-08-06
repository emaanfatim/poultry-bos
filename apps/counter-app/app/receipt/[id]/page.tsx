"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ReceiptTemplate, Transaction } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { ReceiptPreview } from "../../components/sales/ReceiptPreview";
import { DynamicReceiptPreview } from "../../components/sales/DynamicReceiptPreview";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchTransaction } from "../../services/sales";
import { fetchResolvedReceiptTemplate } from "../../services/receiptTemplates";
import Link from "next/link";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useI18n();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [template, setTemplate] = useState<ReceiptTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token || !params.id) return;
    Promise.all([
      fetchTransaction(token, params.id),
      // A template fetch failure shouldn't block the receipt itself —
      // just fall back to the built-in layout.
      fetchResolvedReceiptTemplate(token).catch(() => null),
    ])
      .then(([txn, tmpl]) => {
        setTransaction(txn);
        setTemplate(tmpl);
      })
      .finally(() => setIsLoading(false));
  }, [token, params.id]);

  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1 p-4">
          {isLoading && <p className="text-center">{t.common.loading}</p>}
          {transaction && (
            <>
              {template ? (
                <DynamicReceiptPreview
                  transaction={transaction}
                  template={template}
                  onPrint={() => window.print()}
                  onNewSale={() => router.push("/pos")}
                />
              ) : (
                <ReceiptPreview
                  transaction={transaction}
                  onPrint={() => window.print()}
                  onNewSale={() => router.push("/pos")}
                />
              )}
              {/* Kitchen ticket link — shown below receipt actions, visible to
                  any staff member who needs to hand a slip to the kitchen */}
              <div className="mx-auto mt-3 max-w-lg print:hidden">
                <Link
                  href={`/ticket/${transaction.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  <span>🍽</span>
                  <span>Print Kitchen Ticket</span>
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
