# EQViz — 지진 위험도 분석 대시보드

과거 지진 데이터를 기반으로 지역별 위험도를 분석하고, 인터랙티브 지도/3D 지구본으로 시각화하는 웹 대시보드입니다.

---

## 주요 기능

- **히트맵**: KMeans 클러스터링 기반 지역별 위험도 시각화
- **지진 마커**: 규모별 크기·색상, 깊이별 테두리 스타일, 줌 반응형 크기 조절
- **타임라인 재생**: 연도/월/30분 슬롯 단위 롤링 윈도우(±60h) 재생
- **LIVE 모드**: USGS API 실시간 지진 데이터 (1분 갱신)
- **3D 지구본**: Globe.gl 기반 규모 비례 3D 바 시각화
- **MMI 진도 링**: 클릭 시 피해 반경 3단계 표시, 전체 표시 토글
- **쓰나미 경고**: 깊이 ≤70km + M6.5+ 자동 감지, 깜빡임 애니메이션
- **여진 목록**: 본진 클릭 시 30일·100km 반경 내 여진 자동 탐색
- **지진음 재합성**: Web Audio API 기반 규모별 사운드 (M4 틱 → M7+ 저음 rumble)
- **지판 경계 오버레이**: PB2002 데이터 기반 판 경계 표시

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 지도 | [Leaflet.js](https://leafletjs.com/) + leaflet.heat |
| 차트 | [Chart.js](https://www.chartjs.org/) |
| 3D 지구본 | [Globe.gl](https://globe.gl/) |
| 데이터 API | [USGS Earthquake Catalog API](https://earthquake.usgs.gov/fdsnws/event/1/) |
| 위험도 분석 | Google Colab + KMeans 클러스터링 (scikit-learn) |
| 사운드 | Web Audio API |
| 프레임워크 | 없음 (Vanilla HTML/CSS/JS, ES Modules) |

---

## 실행 방법

별도 빌드 과정 없이 정적 파일 서버만 있으면 됩니다.

```bash
# npx serve 사용 (권장)
npx serve .

# 또는 Python
python -m http.server 8080
```

브라우저에서 `http://localhost:3000` 접속.

> `file://` 프로토콜로 직접 열면 ES Module 및 fetch가 차단되므로 반드시 로컬 서버를 사용하세요.

---

## 데이터 출처

- **USGS Earthquake API** — M4.0+ 지진 이벤트 실시간/과거 데이터  
  `https://earthquake.usgs.gov/fdsnws/event/1/query`
- **risk_data.json** — Google Colab에서 2010–2024년 데이터를 KMeans(k=4) 클러스터링하여 생성한 격자별 위험도 분류 결과
- **stats.json** — 연도별 발생 건수 및 통계 요약 (Colab 생성)
- **PB2002** — 지판 경계 GeoJSON ([fraxen/tectonicplates](https://github.com/fraxen/tectonicplates))

---

## 디렉토리 구조

```
EQViz/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js       # 진입점
│   ├── data.js       # 데이터 로드 (USGS API + 로컬 JSON)
│   ├── map.js        # Leaflet 지도 레이어
│   ├── globe.js      # Globe.gl 3D 지구본
│   ├── chart.js      # Chart.js 차트
│   ├── ui.js         # UI 상태 관리 및 재생 컨트롤
│   └── audio.js      # Web Audio API 사운드
└── data/
    ├── risk_data.json
    ├── recent_earthquakes.json
    └── stats.json
```
