import { createBrowserClient } from "@supabase/ssr";
import {
  isPreviewMode,
  previewDepartments,
  previewProfiles,
  previewSops,
} from "../preview-data.ts";

function makePreviewQuery(table: string) {
  const filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }> = [];
  let sortColumn: string | null = null;
  let sortAscending = true;
  let rowLimit: number | null = null;

  function rowsForTable() {
    if (table === "departments") return previewDepartments.map((department) => ({ ...department }));
    if (table === "profiles") return previewProfiles.map((profile) => ({ ...profile }));
    if (table === "sops") return previewSops.map((sop) => ({ ...sop }));
    return [];
  }

  function applyFilters(rows: Array<Record<string, unknown>>) {
    return rows.filter((row) =>
      filters.every((filter) => {
        const value = row[filter.column];
        if (filter.kind === "eq") {
          return value === filter.value;
        }
        if (!Array.isArray(filter.value)) return false;
        return filter.value.includes(value);
      })
    );
  }

  function orderRows(rows: Array<Record<string, unknown>>) {
    if (!sortColumn) return rows;
    return rows.sort((left, right) => {
      const a = left[sortColumn!];
      const b = right[sortColumn!];
      if (a === b) return 0;
      if (a == null) return sortAscending ? 1 : -1;
      if (b == null) return sortAscending ? -1 : 1;
      return String(a).localeCompare(String(b)) * (sortAscending ? 1 : -1);
    });
  }

  function buildResult(single = false) {
    let rows = applyFilters(rowsForTable());
    rows = orderRows(rows);
    if (rowLimit != null) rows = rows.slice(0, rowLimit);
    if (table === "sops") {
      rows = rows.map((row) => {
        if (row["department_id"] && !row["departments"]) {
          const department = previewDepartments.find((item) => item.id === row["department_id"]);
          return {
            ...row,
            departments: department ? [{ display_name: department.display_name }] : null
          };
        }
        return row;
      });
    }
    if (single) {
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: "Not found" } };
    }
    return { data: rows, error: null };
  }

  const query: any = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ kind: "eq", column, value });
      return query;
    },
    in(column: string, value: unknown[]) {
      filters.push({ kind: "in", column, value });
      return query;
    },
    order(column: string, options?: { ascending?: boolean }) {
      sortColumn = column;
      sortAscending = options?.ascending !== false;
      return query;
    },
    limit(value: number) {
      rowLimit = value;
      return query;
    },
    single() {
      return Promise.resolve(buildResult(true));
    },
    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      return Promise.resolve(buildResult(false)).then(resolve, reject);
    }
  };

  return query;
}

export function createClient() {
  if (isPreviewMode()) {
    return {
      auth: {
        async signInWithOtp() {
          return { data: null, error: null };
        }
      },
      from(table: string) {
        return makePreviewQuery(table);
      }
    };
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
