// 시연용 합성 데이터입니다. 실제 사용자·센터·연락처가 아닙니다.
// A(로그인)와 B(설명서)가 병합되면 해당 담당 모듈의 데이터로 대체합니다.

export const CATEGORIES = Object.freeze(['소통', '식사', '위생', '약', '일과', '정서·행동', '안전']);
export const SENSITIVE_CATEGORIES = Object.freeze(['위생']);
export const CENTER_TYPES = Object.freeze(['긴급돌봄센터', '돌봄SOS센터', '활동지원기관', '특수학교', '민간돌봄']);

const ids = {
  guardian: '00000000-0000-4000-8000-000000000001',
  caregiverGn: '00000000-0000-4000-8000-000000000002',
  adminGn: '00000000-0000-4000-8000-000000000003',
  caregiverSos: '00000000-0000-4000-8000-000000000004',
  adminSos: '00000000-0000-4000-8000-000000000005',
  recipient: '00000000-0000-4000-8000-0000000000a1',
  centerGn: '00000000-0000-4000-8000-0000000000c1',
  centerSos: '00000000-0000-4000-8000-0000000000c2',
  centerSchool: '00000000-0000-4000-8000-0000000000c3',
};

export const DEMO_IDS = Object.freeze(ids);

export function createDemoData() {
  return {
    centers: [
      { id: ids.centerGn, name: '시연용 동남권 긴급돌봄센터', center_type: '긴급돌봄센터', region: '서울 동남권', source: 'synthetic' },
      { id: ids.centerSos, name: '시연용 돌봄SOS센터', center_type: '돌봄SOS센터', region: '서울 강남구', source: 'synthetic' },
      { id: ids.centerSchool, name: '시연용 ○○특수학교', center_type: '특수학교', region: '서울 송파구', source: 'synthetic' },
    ],
    // A의 user_roles + profiles 형식을 따릅니다.
    users: [
      { user_id: ids.guardian, role: 'guardian', display_name: '시연 보호자', relation: '어머니' },
      { user_id: ids.caregiverGn, role: 'caregiver', display_name: '김지현', caregiver_type: '긴급돌봄센터 종사자', center_id: ids.centerGn },
      { user_id: ids.adminGn, role: 'center_admin', display_name: '동남권 센터 관리자', center_id: ids.centerGn },
      { user_id: ids.caregiverSos, role: 'caregiver', display_name: '박서준', caregiver_type: '돌봄SOS 매니저', center_id: ids.centerSos },
      { user_id: ids.adminSos, role: 'center_admin', display_name: '돌봄SOS 센터 관리자', center_id: ids.centerSos },
    ],
    care_recipients: [
      { id: ids.recipient, guardian_user_id: ids.guardian, name: '민준(시연)' },
    ],
    // TODO(B): getShareableSummary가 병합되면 B의 확정 항목 수로 대체합니다.
    // 카테고리별 confirmed 항목 수(합성). 0이면 공유 범위에서 고를 수 없습니다.
    manual_summary: {
      [ids.recipient]: { 소통: 2, 식사: 1, 위생: 1, 약: 0, 일과: 0, '정서·행동': 3, 안전: 0 },
    },
  };
}
