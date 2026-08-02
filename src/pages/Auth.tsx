import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const vendor = searchParams.get('vendor') || 'Infrastructure';

  useEffect(() => {
    if (vendor === 'Contractor') {
      navigate('/contractor/dashboard', { replace: true });
    } else if (vendor === 'ATG') {
      window.location.href = "/ghilotti_site_survey_form.html";
    } else {
      // Default to Contractor Dashboard for direct access or Google redirection
      window.location.href = "https://accounts.google.com";
    }
  }, [vendor, navigate]);

  return null;
};

export default Auth;
