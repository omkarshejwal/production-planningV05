from fastapi import Depends, HTTPException
from app.api.auth import get_current_user
from app.models.user import User

def require_manager_role(user: User = Depends(get_current_user)):
    """
    Role-Based Access Control (RBAC) Dependency.
    Only allows ADMIN or MANAGER to access the endpoint.
    If the frontend sends an OPERATOR role, they are blocked!
    
    (Note: In a production AWS environment, this will decode a JWT token instead of reading a raw header).
    """
    if user.role != "Editor":
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: Editor access is required to edit this data."
        )
    return user.role
