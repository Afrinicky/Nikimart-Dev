import { Suspense } from "react";
import { PackageCheck } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { formatDateTime } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function GoodsReceivedPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/goods-received");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const q = one(query.q);

  const where = q
    ? {
        OR: [
          { reference: { contains: q, mode: "insensitive" as const } },
          { deliveryNote: { contains: q, mode: "insensitive" as const } },
          { purchaseOrder: { reference: { contains: q, mode: "insensitive" as const } } },
          {
            purchaseOrder: {
              supplier: { name: { contains: q, mode: "insensitive" as const } },
            },
          },
        ],
      }
    : {};

  const { rows, total } = await readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.goodsReceipt.findMany({
          where,
          select: {
            id: true,
            reference: true,
            receivedAt: true,
            deliveryNote: true,
            items: { select: { quantityAccepted: true, quantityRejected: true } },
            purchaseOrder: {
              select: { id: true, reference: true, supplier: { select: { name: true } } },
            },
          },
          orderBy: { receivedAt: "desc" },
          skip,
          take: perPage,
        }),
        medicalDb.goodsReceipt.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Goods receipts"
        subtitle="Every delivery recorded against a purchase order. Only accepted quantities entered stock."
        icon={PackageCheck}
      />

      <Suspense fallback={<div className="h-9 w-72" />}>
        <ConsoleSearch placeholder="Note number, order or supplier" className="w-full sm:w-80" />
      </Suspense>

      <ConsoleTable
        columns={[
          "Note",
          "Order",
          "Supplier",
          "Received",
          "Delivery note",
          { label: "Accepted", numeric: true },
          { label: "Rejected", numeric: true },
        ]}
        empty={{
          title: "Nothing received yet",
          body: "Record a delivery from the purchase order it arrived against, so the accepted quantity enters stock at the right landed cost.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((receipt) => {
          const accepted = receipt.items.reduce((n, i) => n + i.quantityAccepted, 0);
          const rejected = receipt.items.reduce((n, i) => n + i.quantityRejected, 0);
          return (
            <Row key={receipt.id}>
              <td className={tdKey}>
                <span className="font-figures">{receipt.reference}</span>
              </td>
              <td className={td}>
                <MedicalLink
                  href={`/medicals/admin/purchase-orders/${receipt.purchaseOrder.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {receipt.purchaseOrder.reference}
                </MedicalLink>
              </td>
              <td className={td}>{receipt.purchaseOrder.supplier.name}</td>
              <td className={td}>{formatDateTime(receipt.receivedAt)}</td>
              <td className={td}>
                <span className="font-figures">{receipt.deliveryNote || "—"}</span>
              </td>
              <td className={tdNum}>{accepted}</td>
              <td className={tdNum}>
                {rejected > 0 ? <StatusBadge label={String(rejected)} tone="bad" /> : <span className="text-medi-muted">0</span>}
              </td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
