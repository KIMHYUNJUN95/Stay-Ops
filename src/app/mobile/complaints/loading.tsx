import "@/components/complaints/complaints.css";

/**
 * 컴플레인 목록 로딩 (목업 2c).
 *
 * 이 화면은 서버에서 필터·페이지·집계를 끝내고 내려오므로 첫 페인트까지 왕복이 한 번 있다.
 * 그동안 빈 화면을 보여 주면 «데이터가 없다» 와 구분되지 않는다 — 리뷰가 2,400건 있는데도
 * 빈 화면이면 고장으로 읽힌다. 카드 형태를 미리 그려 «오는 중»임을 알린다.
 *
 * 서버 컴포넌트라 `loading.tsx` 로 붙인다. 클라이언트 상태를 만들지 않는다.
 */
export default function Loading() {
  return (
    <div className="cx cx-reviews" aria-busy="true">
      <div className="cx-ctrlrow">
        <div className="cx-skel cx-skel--seg" />
        <div className="cx-skel cx-skel--chip" />
      </div>
      <div className="cx-countrow">
        <div className="cx-skel cx-skel--count" />
      </div>
      <div className="cx-rlist">
        {[0, 1, 2].map((i) => (
          <div className="cx-rcard cx-skelcard" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
            <div className="cx-rcard__h">
              <div className="cx-skel cx-skel--score" />
              <div className="cx-rcard__hb">
                <div className="cx-skel cx-skel--line" style={{ width: "52%" }} />
                <div className="cx-skel cx-skel--line" style={{ width: "80%", marginTop: 7 }} />
              </div>
            </div>
            <div className="cx-skel cx-skel--line" style={{ width: "92%" }} />
            <div className="cx-skel cx-skel--line" style={{ width: "70%", marginTop: 7 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
