import { Link } from 'react-router-dom';
import styled from 'styled-components';

const BackLink = styled(Link)`
  display: inline-block;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.textDim};
  margin-bottom: 2rem;
`;

export default function Layout({ title, subtitle, children }) {
  return (
    <>
      <BackLink to="/">&larr; All Tools</BackLink>
      <h1>{title}</h1>
      <Subtitle>{subtitle}</Subtitle>
      {children}
    </>
  );
}
