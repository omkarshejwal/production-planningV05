import sys
import os

# Ensure the Backend directory is on sys.path so that `import app` works
# when pytest is run from the repository root as: pytest Backend/tests/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
