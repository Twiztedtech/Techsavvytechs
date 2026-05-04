import React from 'react';
import { Hero } from '../components/sections/Hero';
import { Stats } from '../components/sections/Stats';
import { Services } from '../components/sections/Services';
import { LocalExposure } from '../components/sections/LocalExposure';
import { ContactCTA } from '../components/sections/ContactCTA';

const Home = () => {
  return (
    <>
      <Hero />
      <Stats />
      <Services />
      <LocalExposure />
      <ContactCTA />
    </>
  );
};

export default Home;
