import { randomUUID } from 'node:crypto';
import { CATEGORIES, createDemoData } from './demo-data.mjs';

// D 담당: 아이 맡기기(신청) · 센터 수락·배정 · 공유 권한.
// 저장소 결정 전까지 메모리 저장소로 동작합니다. 필드 이름은 D 매뉴얼 데이터 계약을 따릅니다.

export class CareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PENDING = new Set(['submitted']);

export function createCareStore({ now = () => new Date() } = {}) {
  let data = createDemoData();
  let applications = [];
  let assignments = [];
  // A의 회원가입으로 만든 사용자·돌봄 대상. 시연 데이터 초기화(reset)에도 남깁니다(계정은 시연 데이터가 아님).
  const registered = { users: [], recipients: [] };

  const findUser = (userId) => data.users.find((user) => user.user_id === userId);
  const findCenter = (centerId) => data.centers.find((center) => center.id === centerId);
  const findApplication = (id) => applications.find((item) => item.id === id);

  function requireRole(user, role) {
    if (!user) throw new CareError(401, '로그인이 필요해요.');
    if (user.role !== role) throw new CareError(403, '이 작업을 할 수 있는 역할이 아니에요.');
  }

  function parseTime(value, label) {
    if (typeof value !== 'string' || value.length === 0) throw new CareError(400, `${label}을(를) 입력해 주세요.`);
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) throw new CareError(400, `${label} 형식이 올바르지 않아요.`);
    return time;
  }

  function withAssignment(application) {
    const assignment = assignments.find((item) => item.application_id === application.id) ?? null;
    const center = findCenter(application.center_id);
    const caregiver = assignment ? findUser(assignment.caregiver_user_id) : null;
    return {
      ...application,
      center_name: center?.name ?? null,
      assignment: assignment && {
        ...assignment,
        caregiver_name: caregiver?.display_name ?? null,
        caregiver_type: caregiver?.caregiver_type ?? null,
      },
    };
  }

  function assignmentIsLive(assignment, at) {
    return assignment.status === 'active'
      && at >= new Date(assignment.starts_at)
      && at <= new Date(assignment.ends_at);
  }

  return {
    // 공개 시연 사용자 목록에는 회원가입으로 만든 계정을 넣지 않습니다.
    users: () => data.users.filter((user) => !user.registered).map(({ user_id, role, display_name, center_id }) => ({ user_id, role, display_name, center_id: center_id ?? null })),
    getUser: findUser,

    // A 회원가입 연동: 가입한 사용자를 D의 역할 데이터에 등록합니다. 센터·종사자 구분은 호출 쪽이 검증해 넘깁니다.
    registerUser(user) {
      const existing = findUser(user.user_id);
      if (existing) return existing;
      const entry = { ...user, registered: true };
      registered.users.push(entry);
      data.users.push(entry);
      return entry;
    },
    // Supabase에서 복원한 돌봄 대상을 기존 D/B 기능이 같은 UUID로 사용할 수 있게 등록합니다.
    registerRecipient(recipient) {
      const existing = data.care_recipients.find((item) => item.id === recipient.id);
      if (existing) {
        Object.assign(existing, recipient);
        return existing;
      }
      const entry = { ...recipient };
      registered.recipients.push(entry);
      data.care_recipients.push(entry);
      return entry;
    },
    // 보호자의 돌봄 대상을 만들거나 이름을 바꿉니다(보호자당 1명). 이름 검증은 호출 쪽 책임입니다.
    upsertRecipient(guardianUserId, name) {
      let recipient = registered.recipients.find((item) => item.guardian_user_id === guardianUserId);
      if (!recipient) {
        recipient = { id: randomUUID(), guardian_user_id: guardianUserId, name };
        registered.recipients.push(recipient);
        data.care_recipients.push(recipient);
      } else {
        recipient.name = name;
      }
      return { id: recipient.id, name: recipient.name };
    },
    listCenters: () => data.centers.map((center) => ({ ...center })),

    // B의 getShareableSummary 자리(합성). 보호자 본인 대상만 조회합니다.
    shareSummary(user, careRecipientId) {
      requireRole(user, 'guardian');
      const recipient = data.care_recipients.find((item) => item.id === careRecipientId);
      if (!recipient || recipient.guardian_user_id !== user.user_id) throw new CareError(404, '돌봄 대상을 찾을 수 없어요.');
      const counts = data.manual_summary[careRecipientId] ?? {};
      return CATEGORIES.map((category) => ({ category, confirmed_count: counts[category] ?? 0 }));
    },

    myRecipients(user) {
      requireRole(user, 'guardian');
      return data.care_recipients.filter((item) => item.guardian_user_id === user.user_id).map((item) => ({ ...item }));
    },

    createApplication(user, body) {
      requireRole(user, 'guardian');
      const { care_recipient_id: careRecipientId, center_id: centerId, request_note: note } = body ?? {};
      const recipient = data.care_recipients.find((item) => item.id === careRecipientId);
      if (!recipient || recipient.guardian_user_id !== user.user_id) throw new CareError(404, '돌봄 대상을 찾을 수 없어요.');
      if (!findCenter(centerId)) throw new CareError(404, '센터를 찾을 수 없어요.');

      const start = parseTime(body.requested_start_at, '시작 시각');
      const end = parseTime(body.requested_end_at, '끝나는 시각');
      if (end <= start) throw new CareError(400, '끝나는 시각은 시작 시각보다 늦어야 해요.');

      const categories = body.shared_categories;
      if (!Array.isArray(categories) || categories.length === 0) throw new CareError(400, '보낼 정보를 하나 이상 골라 주세요.');
      if (categories.some((category) => !CATEGORIES.includes(category))) throw new CareError(400, '허용되지 않은 카테고리가 있어요.');
      const shared = CATEGORIES.filter((category) => categories.includes(category));
      if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw new CareError(400, '요청사항은 300자 이내로 적어 주세요.');

      const duplicate = applications.find((item) => item.guardian_user_id === user.user_id
        && item.care_recipient_id === careRecipientId
        && item.center_id === centerId
        && PENDING.has(item.status)
        && item.requested_start_at === start.toISOString()
        && item.requested_end_at === end.toISOString());
      if (duplicate) throw new CareError(409, '같은 요청이 이미 전달됐어요.');

      const stamp = now().toISOString();
      const application = {
        id: randomUUID(),
        guardian_user_id: user.user_id,
        care_recipient_id: careRecipientId,
        center_id: centerId,
        requested_start_at: start.toISOString(),
        requested_end_at: end.toISOString(),
        shared_categories: shared,
        request_note: note?.trim() || null,
        status: 'submitted',
        created_at: stamp,
        updated_at: stamp,
      };
      applications.push(application);
      return withAssignment(application);
    },

    listApplications(user) {
      if (!user) throw new CareError(401, '로그인이 필요해요.');
      if (user.role === 'guardian') {
        return applications.filter((item) => item.guardian_user_id === user.user_id).map(withAssignment).reverse();
      }
      if (user.role === 'center_admin') {
        return applications.filter((item) => item.center_id === user.center_id).map(withAssignment).reverse();
      }
      throw new CareError(403, '이 작업을 할 수 있는 역할이 아니에요.');
    },

    centerCaregivers(user) {
      requireRole(user, 'center_admin');
      return data.users
        .filter((item) => item.role === 'caregiver' && item.center_id === user.center_id)
        .map(({ user_id, display_name, caregiver_type }) => ({ user_id, display_name, caregiver_type }));
    },

    assign(user, applicationId, body) {
      requireRole(user, 'center_admin');
      const application = findApplication(applicationId);
      if (!application || application.center_id !== user.center_id) throw new CareError(404, '요청을 찾을 수 없어요.');
      if (application.status !== 'submitted') throw new CareError(409, '이미 처리된 요청이에요.');
      const caregiver = findUser(body?.caregiver_user_id);
      if (!caregiver || caregiver.role !== 'caregiver' || caregiver.center_id !== user.center_id) {
        throw new CareError(400, '이 센터 소속 종사자만 배정할 수 있어요.');
      }
      const assignment = {
        id: randomUUID(),
        application_id: application.id,
        center_id: application.center_id,
        care_recipient_id: application.care_recipient_id,
        caregiver_user_id: caregiver.user_id,
        starts_at: application.requested_start_at,
        ends_at: application.requested_end_at,
        status: 'active',
        created_at: now().toISOString(),
      };
      assignments.push(assignment);
      application.status = 'assigned';
      application.updated_at = assignment.created_at;
      return withAssignment(application);
    },

    reject(user, applicationId) {
      requireRole(user, 'center_admin');
      const application = findApplication(applicationId);
      if (!application || application.center_id !== user.center_id) throw new CareError(404, '요청을 찾을 수 없어요.');
      if (application.status !== 'submitted') throw new CareError(409, '이미 처리된 요청이에요.');
      application.status = 'rejected';
      application.updated_at = now().toISOString();
      return withAssignment(application);
    },

    cancel(user, applicationId) {
      requireRole(user, 'guardian');
      const application = findApplication(applicationId);
      if (!application || application.guardian_user_id !== user.user_id) throw new CareError(404, '요청을 찾을 수 없어요.');
      if (application.status !== 'submitted') throw new CareError(409, '배정 전 요청만 취소할 수 있어요.');
      application.status = 'cancelled';
      application.updated_at = now().toISOString();
      return withAssignment(application);
    },

    complete(user, applicationId) {
      requireRole(user, 'guardian');
      const application = findApplication(applicationId);
      if (!application || application.guardian_user_id !== user.user_id) throw new CareError(404, '요청을 찾을 수 없어요.');
      const assignment = assignments.find((item) => item.application_id === application.id);
      if (!assignment || assignment.status !== 'active') throw new CareError(409, '진행 중인 돌봄이 아니에요.');
      assignment.status = 'completed';
      application.updated_at = now().toISOString();
      return withAssignment(application);
    },

    // 종사자 홈(11)의 대상 목록. 진행 중이거나 곧 시작할 배정을 돌려주고,
    // 설명서를 지금 볼 수 있는지는 can_view_now로 알려 줍니다(시작 전에는 false).
    listMyAssignments(user) {
      requireRole(user, 'caregiver');
      const at = now();
      return assignments
        .filter((item) => item.caregiver_user_id === user.user_id && item.status === 'active' && at <= new Date(item.ends_at))
        .map((item) => {
          const application = findApplication(item.application_id);
          const recipient = data.care_recipients.find((entry) => entry.id === item.care_recipient_id);
          return {
            ...item,
            care_recipient_name: recipient?.name ?? null,
            center_name: findCenter(item.center_id)?.name ?? null,
            shared_categories: [...application.shared_categories],
            request_note: application.request_note,
            can_view_now: assignmentIsLive(item, at),
          };
        });
    },

    // B·C가 쓰는 공유 권한. 배정 active + 기간 안 + 본인 배정일 때만 허용합니다.
    canViewManual(user, careRecipientId) {
      if (!user || user.role !== 'caregiver') return { allowed: false, shared_categories: [] };
      const at = now();
      const live = assignments.find((item) => item.caregiver_user_id === user.user_id
        && item.care_recipient_id === careRecipientId
        && assignmentIsLive(item, at));
      if (!live) return { allowed: false, shared_categories: [] };
      const application = findApplication(live.application_id);
      return { allowed: true, assignment_id: live.id, shared_categories: [...application.shared_categories] };
    },

    reset() {
      data = createDemoData();
      applications = [];
      assignments = [];
      data.users.push(...registered.users);
      data.care_recipients.push(...registered.recipients);
    },
  };
}
