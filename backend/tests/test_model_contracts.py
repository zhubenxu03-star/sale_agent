from app.models.conversation import Conversation, Message
from app.models.tenant import Tenant
from app.models.user import User


def test_enum_columns_persist_public_lowercase_values() -> None:
    assert Tenant.__table__.c.status.type.enums == ["active", "disabled"]
    assert User.__table__.c.role.type.enums == ["admin", "manager", "sales"]
    assert User.__table__.c.status.type.enums == ["active", "disabled"]
    assert Conversation.__table__.c.status.type.enums == ["active", "archived"]
    assert Message.__table__.c.sender_type.type.enums == [
        "customer",
        "sales",
        "assistant",
        "system",
    ]
