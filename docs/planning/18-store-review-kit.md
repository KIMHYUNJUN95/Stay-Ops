# 스토어 심사 대응 자료

> 스토어 콘솔에 그대로 옮겨 적을 답안 모음이다. 진행 상태는 `17-app-release-plan.md` 에서 관리하고, 이 문서는 **내용**만 담는다.
> 근거는 `src/lib/legal-content.ts`(개인정보처리방침)와 실제 구현이다. 수집 항목 · 권한 · 외부 처리자가 바뀌면 이 문서,
> `legal-content.ts`, `ios/App/App/PrivacyInfo.xcprivacy` 를 함께 고친다.

## 1. 권한 안내 문구 (계획 C6)

| 권한 | 언제 쓰나 | 위치 |
| --- | --- | --- |
| 카메라 | 출퇴근 QR 스캔, 업무 기록 사진 촬영 | iOS `NSCameraUsageDescription` · Android `CAMERA` |
| 위치(사용 중) | 출퇴근을 기록하는 순간 한 번. 백그라운드 추적 없음. 거부해도 인증은 진행되고 「위치 없음」으로 기록 | iOS `NSLocationWhenInUseUsageDescription` · Android `ACCESS_FINE/COARSE_LOCATION` |
| 사진 보관함 | 업무 기록에 첨부할 사진 선택 | iOS `NSPhotoLibraryUsageDescription` |

- iOS 문구는 `ios/App/App/{en,ko,ja}.lproj/InfoPlist.strings` 에 3개 언어로 있다. `Info.plist` 의 같은 키는 영어 대체값이다.
  `CFBundleLocalizations` = en · ko · ja (App Store 「언어」 표시와 시스템 권한 팝업 언어).
- Android 권한 팝업 문구는 OS 가 정한다(앱이 바꿀 수 없음).
- 백그라운드 위치 · 마이크 · 연락처 · 추적(ATT) 권한은 **요청하지 않는다**. 추가하려면 이 표부터 고친다.

## 2. iOS 개인정보 매니페스트 (`PrivacyInfo.xcprivacy`)

- `NSPrivacyTracking` = false, 추적 도메인 없음.
- `NSPrivacyAccessedAPITypes` = 비어 있음 — 앱 자체 코드(AppDelegate · SceneDelegate)는 Required Reason API 를 쓰지 않는다.
  Capacitor 와 플러그인(`@capacitor/app` · `browser` 등)은 각자 매니페스트를 포함한다. 플러그인을 추가하면 그 플러그인이 매니페스트를 갖췄는지 확인한다.
- `NSPrivacyCollectedDataTypes` = 아래 3절 표와 같은 9개 항목.

## 3. App Store 개인정보 라벨 (App Store Connect → 앱 개인정보)

- **추적(Tracking): 아니요.** 광고 · 광고 식별자 · 제3자 추적 없음.
- 모든 항목: **사용자에게 연결됨(Linked to You)**, 목적 **앱 기능(App Functionality)** 하나.

| 라벨 분류 | 항목 | 근거 (`legal-content.ts` 「수집하는 정보」) |
| --- | --- | --- |
| 연락처 정보 | 이름 | 계정 정보 |
| 연락처 정보 | 이메일 주소 | 계정 정보 · Google 로그인 |
| 연락처 정보 | 전화번호 | 계정 정보 |
| 위치 | 정확한 위치 | 출퇴근 인증 순간의 GPS |
| 사용자 콘텐츠 | 사진 또는 비디오 | 업무 기록 첨부 사진 · 프로필 사진 |
| 사용자 콘텐츠 | 기타 사용자 콘텐츠 | 청소 · 수리 · 분실물 · 할 일 · 게시판 글과 댓글 |
| 식별자 | 사용자 ID | 계정 ID |
| 식별자 | 기기 ID | 출퇴근 「신뢰 기기」 토큰(앱이 만든 값, 광고 ID 아님) |
| 기타 데이터 | 기타 데이터 유형 | 생년월일 · 성별 · 근태 · 연차 · 급여 계산 정보 |

- 수집하지 않음: 건강 · 금융(카드 · 계좌) · 연락처 목록 · 검색 기록 · 브라우징 기록 · 구매 · 진단(크래시 수집 도구 없음) · 광고 데이터.
- 투숙객 정보(Beds24 예약 · 리뷰)는 앱 사용자 본인의 데이터가 아니라 조직이 연동한 업무 데이터다. 라벨은 「앱 사용자에게서 수집하는 데이터」 기준이므로 넣지 않되,
  방침 본문에는 이미 적혀 있다. 심사관이 물으면 이 설명으로 답한다.

## 4. Google Play 데이터 보안 양식 (Play Console → 앱 콘텐츠 → 데이터 보안)

| 질문 | 답 |
| --- | --- |
| 사용자 데이터를 수집하거나 공유하나요? | 예(수집) |
| 전송 중 데이터 암호화? | 예 (HTTPS 만 사용, `cleartext: false`) |
| 사용자가 데이터 삭제를 요청할 수 있나요? | 예 — 앱 안 계정 → 보안 → 계정 삭제, 웹 `/legal/account-deletion` |
| 제3자와 **공유**? | 아니요 — Supabase · Vercel · Google · Beds24 · DeepL · Slack 은 우리를 대신해 처리하는 서비스 제공자(Play 기준 「공유」 아님) |

수집 항목 — 모두 「수집됨 · 공유 안 함 · 필수 · 목적: 앱 기능, 계정 관리」(위치는 「앱 기능」만):

| Play 분류 | 항목 | 일시적 처리? |
| --- | --- | --- |
| 개인 정보 | 이름 · 이메일 주소 · 사용자 ID · 전화번호 · 기타 정보(생년월일 · 성별) | 아니요 |
| 위치 | 정확한 위치 | 아니요 (출퇴근 기록에 저장) |
| 사진 및 동영상 | 사진 | 아니요 |
| 앱 활동 | 기타 사용자 생성 콘텐츠 | 아니요 |
| 기기 또는 기타 ID | 기기 ID(신뢰 기기 토큰) | 아니요 |

- 「계정 삭제 URL」 = `<앱 주소>/legal/account-deletion` (도메인이 정해지면 C1 에서 교체).
- 「개인정보처리방침 URL」 = `<앱 주소>/legal/privacy`.

## 5. 심사 메모 (App Review Notes · Play 심사 안내) — 초안

제출(C9) 때 데모 계정(B6)과 함께 적는다.

- 업무용 앱: 숙박 시설 운영팀(청소 · 근태 · 유지보수 · 공지)이 쓰는 앱이며, 조직 초대 코드로만 가입한다. 심사용 데모 조직 계정을 제공한다.
- 사용자 간 공개 콘텐츠는 게시판 하나이며 신고 · 차단 · 관리자 처리가 있다(17 「B4-1 검토 결과」).
- 계정 삭제: 계정 → 보안 → 계정 삭제.
- 위치: 출퇴근 버튼을 누르는 순간에만 확인, 백그라운드 추적 없음. 카메라: 출퇴근 QR 스캔과 사진 첨부.
- 예약 캘린더는 예약 시스템(Beds24) 연동 조직에서만 채워지므로 데모 조직에서는 비어 있을 수 있다.
