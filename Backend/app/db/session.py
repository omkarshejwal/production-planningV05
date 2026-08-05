import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Use AWS Postgres if provided, else fallback to local SQLite
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./vitrumglass.db")

# SQLite requires specific arguments that Postgres does not
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    # If the URL is postgres://, SQLAlchemy requires postgresql://
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 2. Create the Session Factory
# When a user hits our API, we want to open a "session" (a temporary connection),
# do our database work, and then safely close it.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Create a Dependency to get the Database
# We will use this function in our API endpoints to talk to the DB.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
