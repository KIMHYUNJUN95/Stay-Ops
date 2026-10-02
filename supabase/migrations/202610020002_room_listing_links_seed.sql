-- 룸 링크 초기 데이터 — STAY ARI Manager 의 실제 저장값(Firestore `roomLinks`, 2026-09-24 수정본)을 옮긴다 (2026-10-02).
--
-- 문서: docs/product/35-room-links.md → 「데이터 이관」
--
-- ## 객실은 이름이 아니라 리스팅 ID 로 맞췄다
--
-- 저쪽 키는 `A201` · `K202호` · `2층` · `SKY/101` 처럼 제각각이라 이름으로 맞추면 틀린다. 우리 외부 리뷰 원본
-- (`external_reviews.raw_payload->>'listing_id'`)이 **Beds24 유닛 ↔ Airbnb 리스팅**을 이미 묶고 있어서, 저쪽 호스트
-- 링크 속 리스팅 ID 와 대조해 유닛을 정했다(90 유닛 전부 확정, 게스트 링크 89 — `OkuboCC` 는 저쪽에도 없음).
--
-- - 저쪽 「SKY」 26 = STAY ARI Apartment Hotel O101~O310. 「다이쿄초」는 그중 5개의 옛 이름(같은 리스팅 ID ·
--   다른 게스트 링크)과 우리에 없는 B01 · B02 라 옮기지 않는다.
-- - 가부키초 K(4~9월) = 우리 `202#` 계열, KK(10~3월) = 우리 `K202` 계열.
-- - 호스트 링크는 리스팅 ID 로 만든다(저쪽 값과 같은 형식).
-- - Booking.com 링크는 저쪽에도 0건 — 넣을 것이 없다.
--
-- 이미 있는 줄은 건드리지 않는다(`on conflict do nothing`) — 다시 돌려도 사람이 고친 값을 덮지 않는다.

insert into public.room_listing_links (organization_id, room_id, channel, listing_id, host_url, guest_url)
select r.organization_id, r.id, 'airbnb', v.listing_id,
       'https://www.airbnb.co.kr/hosting/listings/editor/' || v.listing_id || '/details/photo-tour',
       v.guest_url
from (values
  ('Arakicho A', '201', '31627968', 'https://airbnb.co.kr/h/abo1'),
  ('Arakicho A', '201_2', '1475641369123867060', 'https://airbnb.co.kr/h/abo11'),
  ('Arakicho A', '202', '29538888', 'https://airbnb.co.kr/h/abo2'),
  ('Arakicho A', '202_2', '1475647650320257070', 'https://airbnb.co.kr/h/abo22'),
  ('Arakicho A', '301', '32319977', 'https://airbnb.co.kr/h/aco1111'),
  ('Arakicho A', '301_2', '1475649511878269809', 'https://airbnb.co.kr/h/aco111'),
  ('Arakicho A', '302', '26860834', 'https://airbnb.co.kr/h/aco222'),
  ('Arakicho A', '302_2', '1475651065394178900', 'https://airbnb.co.kr/h/aco2222'),
  ('Arakicho A', '401', '965496947227437163', 'https://airbnb.co.kr/h/ado1'),
  ('Arakicho A', '401_2_2', '1226434787675511721', 'https://airbnb.co.kr/h/ado11'),
  ('Arakicho A', '402', '33408043', 'https://airbnb.co.kr/h/ado2'),
  ('Arakicho A', '402_2', '1475652539637046506', 'https://airbnb.co.kr/h/ado22'),
  ('Arakicho A', '501', '1177012477469914627', 'https://airbnb.co.kr/h/aeo1'),
  ('Arakicho A', '501_2', '1475654160057245015', 'https://airbnb.co.kr/h/aeo11'),
  ('Arakicho A', '502', '37975765', 'https://airbnb.co.kr/h/aeo2'),
  ('Arakicho A', '502_2', '1475656143356508931', 'https://airbnb.co.kr/h/aeo22'),
  ('Arakicho A', '602', '1308978353920009109', 'https://airbnb.co.kr/h/afo2'),
  ('Arakicho A', '602_2', '1475657788719260045', 'https://airbnb.co.kr/h/afo22'),
  ('Arakicho A', '701', '26912150', 'https://airbnb.co.kr/h/ago1'),
  ('Arakicho A', '701_2', '1475659461497076543', 'https://airbnb.co.kr/h/ago11'),
  ('Arakicho A', '702', '34760627', 'https://airbnb.co.kr/h/ago22'),
  ('Arakicho A', '702_2', '1475660853273484659', 'https://airbnb.co.kr/h/ago222'),
  ('Arakicho B', 'Ab101', '1439443421026163183', 'https://airbnb.co.kr/h/ab101'),
  ('Arakicho B', 'Ab102', '1440146085380961828', 'https://airbnb.co.kr/h/ab102'),
  ('Arakicho B', 'Ab201', '1439610992297640983', 'https://airbnb.co.kr/h/ab2011'),
  ('Arakicho B', 'Ab202', '1440878497991046888', 'https://airbnb.co.kr/h/ab2022'),
  ('Arakicho B', 'Ab301', '1440119786853463001', 'https://airbnb.co.kr/h/ab3011'),
  ('Arakicho B', 'Ab302', '1440873306709137111', 'https://airbnb.co.kr/h/ab3022'),
  ('Arakicho B', 'Ab401', '1440120712821303902', 'https://airbnb.co.kr/h/ab401'),
  ('Arakicho B', 'Ab402', '1440879387948238201', 'https://airbnb.co.kr/h/ab402'),
  ('Kabukicho', '202#', '674791405856669260', 'https://airbnb.co.kr/h/kbo2'),
  ('Kabukicho', 'K202', '1004589512654505656', 'https://airbnb.co.kr/h/kbo22'),
  ('Kabukicho', '203#', '674791248225802576', 'https://airbnb.co.kr/h/kbo3'),
  ('Kabukicho', 'K203', '1258451908974622371', 'https://airbnb.co.kr/h/kbo33'),
  ('Kabukicho', '302#', '674790334608233257', 'https://airbnb.co.kr/h/kco2'),
  ('Kabukicho', 'K302', '1065425521631717775', 'https://airbnb.co.kr/h/kco22'),
  ('Kabukicho', '303#', '40383364', 'https://airbnb.co.kr/h/kco3'),
  ('Kabukicho', 'K303', '1004590776928048324', 'https://airbnb.co.kr/h/kco33'),
  ('Kabukicho', '402#', '39845924', 'https://airbnb.co.kr/h/kdo2'),
  ('Kabukicho', 'K402', '1004597146924872733', 'https://airbnb.co.kr/h/kdo22'),
  ('Kabukicho', '403#', '43537759', 'https://airbnb.co.kr/h/kdo3'),
  ('Kabukicho', 'K403', '1258455192909469421', 'https://airbnb.co.kr/h/kdo33'),
  ('Kabukicho', '502#', '1322712136599292464', 'https://airbnb.co.kr/h/keo2'),
  ('Kabukicho', 'K502', '1475671751519601833', 'https://airbnb.co.kr/h/keo22'),
  ('Kabukicho', '603#', '736480106840116372', 'https://airbnb.co.kr/h/kfo3'),
  ('Kabukicho', 'K603', '1258456014791965308', 'https://airbnb.co.kr/h/kfo33'),
  ('Kabukicho', '802#', '972662598267724681', 'https://airbnb.co.kr/h/kho2'),
  ('Kabukicho', 'K802', '1258456948313175515', 'https://airbnb.co.kr/h/kho22'),
  ('Kabukicho', '803#', '1542550658971450491', 'https://airbnb.co.kr/h/keo83'),
  ('Kabukicho', 'K803', '1611942777016278609', 'https://airbnb.co.kr/h/keo83-2'),
  ('Takadanobaba', '2', '1214230580288626213', 'https://airbnb.co.kr/h/baba2'),
  ('Takadanobaba', '3', '1216877132493273384', 'https://airbnb.co.kr/h/baba3'),
  ('Takadanobaba', '4', '1182114775644658542', 'https://airbnb.co.kr/h/baba4'),
  ('Takadanobaba', '5', '1214236999603623357', 'https://airbnb.co.kr/h/baba5'),
  ('Takadanobaba', '6', '1214238348307908175', 'https://airbnb.co.kr/h/baba6'),
  ('Takadanobaba', '7', '1214239283431336487', 'https://airbnb.co.kr/h/baba7'),
  ('Takadanobaba', '8', '1214240267860622382', 'https://airbnb.co.kr/h/baba8'),
  ('Takadanobaba', '9', '1214241285798631988', 'https://airbnb.co.kr/h/baba9'),
  ('STAY ARI Apartment Hotel', 'O101', '1730319020821667608', 'https://airbnb.co.kr/h/sk101'),
  ('STAY ARI Apartment Hotel', 'O102', '1730332337959608116', 'https://airbnb.co.kr/h/sky102'),
  ('STAY ARI Apartment Hotel', 'O103', '1730315324167837624', 'https://airbnb.co.kr/h/sk103'),
  ('STAY ARI Apartment Hotel', 'O105', '1730739724448416328', 'https://airbnb.co.kr/h/sk105'),
  ('STAY ARI Apartment Hotel', 'O106', '1730813879259397842', 'https://airbnb.co.kr/h/sk106'),
  ('STAY ARI Apartment Hotel', 'O107', '1730906793961501490', 'https://airbnb.co.kr/h/sk107'),
  ('STAY ARI Apartment Hotel', 'O108', '1730945222883467089', 'https://airbnb.co.kr/h/sk108'),
  ('STAY ARI Apartment Hotel', 'O109', '1730947449117489982', 'https://airbnb.co.kr/h/sk109'),
  ('STAY ARI Apartment Hotel', 'O110', '1730949699383888324', 'https://airbnb.co.kr/h/sk110'),
  ('STAY ARI Apartment Hotel', 'O201', '1730333373467601656', 'https://airbnb.co.kr/h/sk201'),
  ('STAY ARI Apartment Hotel', 'O202', '1730334245430998358', 'https://airbnb.co.kr/h/sky202'),
  ('STAY ARI Apartment Hotel', 'O203', '965553590629698304', 'https://airbnb.co.kr/h/sk203'),
  ('STAY ARI Apartment Hotel', 'O205', '965563478624315997', 'https://airbnb.co.kr/h/sk205'),
  ('STAY ARI Apartment Hotel', 'O206', '965564827009588959', 'https://airbnb.co.kr/h/sk206'),
  ('STAY ARI Apartment Hotel', 'O207', '965566400786989909', 'https://airbnb.co.kr/h/sk207'),
  ('STAY ARI Apartment Hotel', 'O208', '965562240007732988', 'https://airbnb.co.kr/h/sk208'),
  ('STAY ARI Apartment Hotel', 'O209', '1730952538407238073', 'https://airbnb.co.kr/h/sk209'),
  ('STAY ARI Apartment Hotel', 'O210', '1730954453309277057', 'https://airbnb.co.kr/h/sk210'),
  ('STAY ARI Apartment Hotel', 'O302', '1730335197701117128', 'https://airbnb.co.kr/h/sk302'),
  ('STAY ARI Apartment Hotel', 'O303', '1730956542151180939', 'https://airbnb.co.kr/h/sk303'),
  ('STAY ARI Apartment Hotel', 'O305', '1730958213374266340', 'https://airbnb.co.kr/h/sk305'),
  ('STAY ARI Apartment Hotel', 'O306', '1730960064824841137', 'https://airbnb.co.kr/h/sk306'),
  ('STAY ARI Apartment Hotel', 'O307', '1730962067075190343', 'https://airbnb.co.kr/h/sk307'),
  ('STAY ARI Apartment Hotel', 'O308', '1730964757498218137', 'https://airbnb.co.kr/h/sk308'),
  ('STAY ARI Apartment Hotel', 'O309', '1730966200197339000', 'https://airbnb.co.kr/h/sk309'),
  ('STAY ARI Apartment Hotel', 'O310', '1730967893918732366', 'https://airbnb.co.kr/h/sk310'),
  ('Okubo_A (B棟)', '오쿠보A', '952403875937085488', 'https://airbnb.co.kr/h/higashishinjuku'),
  ('Okubo_B (A棟)', 'ファミリー', '1517052329343209381', 'https://airbnb.co.kr/h/higashishinjuku22'),
  ('Okubo_C (kr)', 'OkuboCC', '1611917089580064705', null),
  ('Okubo_C (kr)', '오쿠보 2-1', '1001187077644900557', 'https://airbnb.co.kr/h/krresidence'),
  ('Okubo_C (kr)', '1-13-1-2', '1160408333491885274', 'https://airbnb.co.kr/h/okubo2'),
  ('Sano', '別荘', '1109872746221826901', 'https://airbnb.co.kr/h/sanobessou')
) as v(property_name, room_label, listing_id, guest_url)
join public.properties p on p.name = v.property_name
join public.rooms r on r.property_id = p.id and r.organization_id = p.organization_id and r.room_label = v.room_label
on conflict (room_id, channel) do nothing;
