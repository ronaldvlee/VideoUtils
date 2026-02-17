import styled from 'styled-components';

const FooterContainer = styled.footer`
  margin-top: 4rem;
  text-align: center;
  padding-bottom: 2rem;
`;

const GitHubLink = styled.a`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.85rem;
  text-decoration: none;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
    color: ${({ theme }) => theme.accent};
  }
`;

export default function Footer() {
  return (
    <FooterContainer>
      <GitHubLink
        href="https://github.com/ronaldvlee/VideoUtils"
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub
      </GitHubLink>
    </FooterContainer>
  );
}
