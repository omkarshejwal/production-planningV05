from fastapi import Header, HTTPException

def require_manager_role(x_user_role: str = Header(default="OPERATOR")):
    """
    Role-Based Access Control (RBAC) Dependency.
    Only allows ADMIN or MANAGER to access the endpoint.
    If the frontend sends an OPERATOR role, they are blocked!
    
    (Note: In a production AWS environment, this will decode a JWT token instead of reading a raw header).
    """
    if x_user_role not in ["ADMIN", "MANAGER"]:
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: You do not have permission to edit this data. Managers and Admins only."
        )
    return x_user_role
