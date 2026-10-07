import { NextResponse } from "next/server";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full, self-contained export of the Data Bundles Postgres database.
 *
 * This intentionally reads the database tables rather than a hand-maintained
 * list of Prisma models, so newly added Data Bundles tables are included in
 * future backups automatically.
 */
export async function GET() {
  try {
    await requireAdmin();

    const tables = await dataDb.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;

    const snapshot: Record<string, unknown> = {};

    for (const { table_name } of tables) {
      const safeTable = table_name.replace(/"/g, '""');
      snapshot[table_name] = await dataDb.$queryRawUnsafe(
        `SELECT * FROM "${safeTable}"`,
      );
    }

    const payload = {
      format: "nickimart-data-backup",
      version: 1,
      generatedAt: new Date().toISOString(),
      database: "data-bundles",
      tables: snapshot,
    };

    const body = JSON.stringify(
      payload,
      (_key, value) => {
        if (typeof value === "bigint") return value.toString();
        if (value instanceof Date) return value.toISOString();
        if (value && typeof value === "object" && typeof value.toJSON === "function") {
          return value.toJSON();
        }
        return value;
      },
      2,
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="nickimart-data-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[data-backup] export failed", error);
    return NextResponse.json(
      { error: "Could not create the Data Bundles backup." },
      { status: 500 },
    );
  }
}
