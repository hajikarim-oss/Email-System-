import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OnboardingPage() {
    const navigate = useNavigate();
    useEffect(() => {
        navigate("/app/emails", { replace: true });
    }, [navigate]);
    return null;
}
