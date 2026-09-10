import { CAPABILITIES, CAPABILITY_KEYS } from "@/config/capabilities";

/**
 * `capability_roles` 시드 SQL 생성 — 역할표의 **DB 쪽 사본을 코드에서 만든다.**
 *
 * 역할표는 `src/config/capabilities.ts` 에만 있다. 그런데 RLS 정책은 SQL 안에서 판정해야 하므로
 * DB 에도 같은 내용이 있어야 한다. 그 사본을 **손으로 적으면 그 순간 정의가 두 벌**이 되고, 이
 * 저장소는 판정식이 갈라지는 사고를 반복해서 겪었다.
 *
 * 그래서 사본은 여기서 생성하고, `capability-registry.test.ts` 가 마이그레이션 파일의 생성 구간과
 * 일치하는지 검사한다. 레지스트리를 고치고 마이그레이션을 안 고치면 **테스트가 깨지고, 붙여넣을
 * SQL 을 그대로 출력해 준다.**
 *
 * 설계 문서: `docs/engineering/14-permission-architecture.md` §6
 */

/** 생성 구간의 경계. 마이그레이션의 나머지(표·함수 정의)는 사람이 쓴다. */
export const SEED_BEGIN = "-- >>> generated: capability_roles seed (do not edit by hand)";
export const SEED_END = "-- <<< generated";

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildCapabilityRolesSeedSql(): string {
  const rows: string[] = [];
  for (const capability of CAPABILITY_KEYS) {
    for (const role of CAPABILITIES[capability].roles) {
      rows.push(`  (${sqlQuote(capability)}, ${sqlQuote(role)}::organization_role)`);
    }
  }

  const lines = [
    SEED_BEGIN,
    "-- 원본: src/config/capabilities.ts. 손으로 고치지 않는다 —",
    "-- src/lib/__tests__/capability-registry.test.ts 가 붙여넣을 내용을 출력한다.",
    "delete from public.capability_roles;",
  ];

  if (rows.length === 0) {
    // 모든 키가 「지정된 개인만」인 상태. 표를 비우는 것만으로 충분하다.
    lines.push("-- (역할 부여가 있는 권한 키가 없다)");
  } else {
    lines.push("insert into public.capability_roles (capability, role) values");
    lines.push(`${rows.join(",\n")};`);
  }

  lines.push(SEED_END);
  return lines.join("\n");
}

/** 마이그레이션 파일에서 생성 구간만 잘라낸다. 경계를 못 찾으면 `null`. */
export function extractCapabilityRolesSeedSql(fileContent: string): string | null {
  const start = fileContent.indexOf(SEED_BEGIN);
  const end = fileContent.indexOf(SEED_END);
  if (start === -1 || end === -1 || end < start) return null;
  return fileContent.slice(start, end + SEED_END.length);
}
