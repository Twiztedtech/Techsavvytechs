import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const vendor = searchParams.get('vendor') || 'Infrastructure';

  useEffect(() => {
    if (vendor === 'Contractor') {
      navigate('/contractor/dashboard', { replace: true });
    } else {
      navigate('/portal', { replace: true });
    }
  }, [vendor, navigate]);

  return null;
};

export default Auth;
