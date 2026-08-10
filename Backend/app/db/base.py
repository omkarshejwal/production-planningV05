from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

class Base(DeclarativeBase):
    pass


def production_fk(table_and_column: str) -> str:
    schema = settings.production_schema
    return f"{schema}.{table_and_column}" if schema else table_and_column


def production_table_args() -> dict[str, str]:
    schema = settings.production_schema
    return {"schema": schema} if schema else {}
