"""Built-in email copy. Custom administrator prose is never auto-translated."""
from copy import deepcopy

KO_EVENTS = {
    "requested": ("승인 요청", "승인 대기 중인 작업을 검토해 주세요."),
    "reminder": ("승인 요청 알림", "아직 결정되지 않은 작업입니다. 마감 전에 검토해 주세요."),
    "approved": ("승인 완료", "요청이 승인되었습니다. 실제 실행 결과는 별도로 확인해 주세요."),
    "denied": ("승인 거부", "요청이 거부되었습니다. 이 알림은 작업을 실행하지 않습니다."),
    "expired": ("승인 요청 만료", "승인 요청의 검토 기한이 만료되었습니다."),
    "cancelled": ("승인 요청 취소", "승인 요청이 취소되었습니다."),
    "execution_succeeded": ("실행 성공 보고", "외부 실행 주체가 작업 성공을 보고했습니다."),
    "execution_failed": ("실행 실패 보고", "외부 실행 주체가 작업 실패를 보고했습니다."),
    "execution_unknown": ("실행 결과 확인 필요", "실행 결과가 확정되지 않았습니다. 중복 실행하지 말고 상태를 확인해 주세요."),
}
KO_GUIDANCE = {
    "EMAIL_PIN": "계정 로그인은 필요하지 않습니다. 이 메일의 4자리 PIN을 입력하고 선택한 결정을 검토한 뒤 최종 확인(Confirm)을 누르세요.",
    "EMAIL_PIN_PLUS_OTP": "계정 로그인은 필요하지 않습니다. 이 메일의 4자리 PIN과 추가 이메일 OTP를 입력한 뒤 최종 확인(Confirm)을 누르세요. 이메일 OTP는 독립적인 MFA 인증 요소가 아닙니다.",
    "EMAIL_PIN_PLUS_MFA": "지정된 승인자 계정으로 로그인하세요. 4자리 PIN과 새로운 MFA 인증을 완료한 뒤 최종 확인(Confirm)을 누르세요.",
}


def event_defaults(locale: str) -> dict:
    from .mail_templates import DEFAULT_EVENT_TEMPLATES

    if locale != "ko":
        return deepcopy(DEFAULT_EVENT_TEMPLATES)
    return {event: {"subject": "[DataRelay Grant] " + title + ": {{request_title}}",
                    "body": body + "\n\n요청: {{request_title}}\n대상: {{target}}\n사유: {{reason}}\n마감: {{deadline}}"}
            for event, (title, body) in KO_EVENTS.items()}
