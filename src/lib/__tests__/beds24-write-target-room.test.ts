import { describe, expect, it } from "vitest";
import {
  resolveMinStayWriteRoomIds,
  resolvePriceWriteRoomIds,
  splitVerificationTargets,
  type WriteTargetUnit,
} from "@/lib/beds24/write-target-room";

/**
 * 어느 Beds24 유닛에 쓰는가.
 *
 * **엉뚱한 유닛에 써도 Beds24 는 `success: true` 를 돌려준다.** 화면에는 「적용됨」이라
 * 뜨고 실제 채널 가격은 그대로다 — 눈으로는 절대 못 잡는다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「쓰기 대상 유닛」
 */

/** 오쿠보C 2026-10-01 실측. 가격 소스와 판매 유닛이 **다르다**. */
const OKUBO_C: WriteTargetUnit[] = [
  { id: "a", externalRoomId: "450096", externalPriceSourceRoomId: null, minStay: 50 },
  { id: "b", externalRoomId: "496532", externalPriceSourceRoomId: "450096", minStay: 99 },
  { id: "c", externalRoomId: "648399", externalPriceSourceRoomId: "450096", minStay: 2 },
];

describe("resolvePriceWriteRoomIds", () => {
  it("가격은 **소스 유닛**에 쓴다 — 운영 중인지와 무관하다", () => {
    // 10/1 에 파는 유닛은 648399 지만 가격은 450096 에 써야 연결로 퍼진다.
    expect(resolvePriceWriteRoomIds(OKUBO_C)).toEqual(["450096"]);
  });

  it("소스가 없으면 자기 자신", () => {
    expect(
      resolvePriceWriteRoomIds([
        { id: "a", externalRoomId: "383971", externalPriceSourceRoomId: null, minStay: 2 },
      ]),
    ).toEqual(["383971"]);
  });

  it("같은 소스를 가리키는 유닛이 여럿이어도 **한 번만** 쓴다", () => {
    // 같은 값을 두 번 보내면 크레딧만 두 배로 쓴다.
    expect(resolvePriceWriteRoomIds(OKUBO_C)).toHaveLength(1);
  });

  it("건물이 섞여 있으면 소스별로 모은다", () => {
    expect(
      resolvePriceWriteRoomIds([
        ...OKUBO_C,
        { id: "d", externalRoomId: "383971", externalPriceSourceRoomId: null, minStay: 2 },
      ]).sort(),
    ).toEqual(["383971", "450096"]);
  });
});

describe("resolveMinStayWriteRoomIds", () => {
  it("최소숙박은 **그 날짜에 운영 중인 유닛**에 쓴다", () => {
    // 가격과 대상이 다르다 — 450096 이 아니라 648399 다.
    expect(resolveMinStayWriteRoomIds(OKUBO_C)).toEqual(["648399"]);
  });

  it("운영 중인 유닛이 없으면 빈 배열 — 그 날짜는 건너뛴다", () => {
    // 안 파는 날의 최소숙박을 바꾸는 것은 의미가 없고, 아무 데나 쓰면 그 유닛이 다시
    // 팔릴 때 엉뚱한 값이 살아난다.
    expect(
      resolveMinStayWriteRoomIds([
        { id: "a", externalRoomId: "450096", externalPriceSourceRoomId: null, minStay: 50 },
        { id: "b", externalRoomId: "496532", externalPriceSourceRoomId: "450096", minStay: 99 },
      ]),
    ).toEqual([]);
  });

  it("둘 이상 운영 중이면 **전부** 쓴다", () => {
    // 하나만 쓰면 화면의 숫자가 안 바뀐다 — 화면은 활성 유닛들의 **가장 짧은** 값을
    // 보여주므로, 다른 활성 유닛이 더 짧으면 한쪽만 고쳐도 표시가 그대로다.
    // 저쪽이 가부키초 803호에서 겪고 하드코딩으로 때운 자리다.
    const units: WriteTargetUnit[] = [
      { id: "a", externalRoomId: "624198", externalPriceSourceRoomId: null, minStay: 2 },
      { id: "b", externalRoomId: "648398", externalPriceSourceRoomId: "624198", minStay: 1 },
    ];
    expect(resolveMinStayWriteRoomIds(units)).toEqual(["624198", "648398"]);
  });

  it("잠긴 유닛은 절대 대상이 아니다 — 잠금이 풀려 listing 이 다시 열린다", () => {
    // `minStay >= 50` 이 곧 「접어둔 유닛」 표시다. 접어둔 것은 나중에 다시 쓸 수 있게
    // 남겨 둔 상태라, 덮어쓰면 조용히 판매가 재개된다.
    const units: WriteTargetUnit[] = [
      { id: "a", externalRoomId: "383971", externalPriceSourceRoomId: null, minStay: 50 },
      { id: "b", externalRoomId: "601545", externalPriceSourceRoomId: "383971", minStay: 2 },
    ];
    expect(resolveMinStayWriteRoomIds(units)).toEqual(["601545"]);
  });

  it("예외 지정이 있으면 그 유닛에만 쓴다", () => {
    const units: WriteTargetUnit[] = [
      { id: "a", externalRoomId: "624198", externalPriceSourceRoomId: null, minStay: 2 },
      { id: "b", externalRoomId: "648398", externalPriceSourceRoomId: "624198", minStay: 2 },
    ];
    expect(resolveMinStayWriteRoomIds(units, "648398")).toEqual(["648398"]);
  });

  it("예외로 지정한 유닛이 그날 잠겨 있으면 무시하고 활성 전부를 쓴다", () => {
    const units: WriteTargetUnit[] = [
      { id: "a", externalRoomId: "624198", externalPriceSourceRoomId: null, minStay: 2 },
      { id: "b", externalRoomId: "648398", externalPriceSourceRoomId: "624198", minStay: 99 },
    ];
    expect(resolveMinStayWriteRoomIds(units, "648398")).toEqual(["624198"]);
  });

  it("같은 유닛이 두 번 들어와도 한 번만 쓴다 — 크레딧이 두 배가 된다", () => {
    const units: WriteTargetUnit[] = [
      { id: "a", externalRoomId: "601545", externalPriceSourceRoomId: null, minStay: 2 },
      { id: "b", externalRoomId: "601545", externalPriceSourceRoomId: null, minStay: 2 },
    ];
    expect(resolveMinStayWriteRoomIds(units)).toEqual(["601545"]);
  });

  it("minStay 를 모르면 운영 중이 아니다", () => {
    // 모르는 것을 「팔고 있다」고 하면 안 파는 유닛에 쓴다.
    expect(
      resolveMinStayWriteRoomIds([
        { id: "a", externalRoomId: "450096", externalPriceSourceRoomId: null, minStay: null },
      ]),
    ).toEqual([]);
  });
});

describe("splitVerificationTargets", () => {
  it("소스와 연결 유닛을 나눈다 — 읽는 기준이 다르다", () => {
    // 소스는 직접 설정값만(includeLinkedPrices=false),
    // 연결 유닛은 전파된 값까지(true) 읽어야 한다.
    const { sourceRoomIds, linkedRoomIds } = splitVerificationTargets(OKUBO_C);
    expect(sourceRoomIds).toEqual(["450096"]);
    expect(linkedRoomIds.sort()).toEqual(["496532", "648399"]);
  });

  it("소스로도 쓰이는 유닛은 소스 기준이 이긴다", () => {
    // 450096 이 양쪽에 들어가면 링크 전파를 기다리다 자기 자신을 못 맞다고 본다.
    const { sourceRoomIds, linkedRoomIds } = splitVerificationTargets(OKUBO_C);
    expect(linkedRoomIds).not.toContain("450096");
    expect(sourceRoomIds).toContain("450096");
  });

  it("연결이 없으면 전부 소스", () => {
    const { sourceRoomIds, linkedRoomIds } = splitVerificationTargets([
      { id: "a", externalRoomId: "383971", externalPriceSourceRoomId: null, minStay: 2 },
    ]);
    expect(sourceRoomIds).toEqual(["383971"]);
    expect(linkedRoomIds).toEqual([]);
  });
});
