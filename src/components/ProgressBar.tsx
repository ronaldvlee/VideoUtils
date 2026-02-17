import styled from 'styled-components';
import * as Progress from '@radix-ui/react-progress';

const Root = styled(Progress.Root)`
  background: ${({ theme }) => theme.surface};
  border-radius: 8px;
  height: 8px;
  overflow: hidden;
`;

const Indicator = styled(Progress.Indicator)`
  height: 100%;
  background: ${({ theme }) => theme.accent};
  border-radius: 8px;
  transition: width 0.3s ease;
`;

const Text = styled.p`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.85rem;
  margin-top: 0.5rem;
`;

const Section = styled.div`
  margin-top: 2rem;
`;

interface ProgressBarProps {
  value: number;
  text?: string;
  title?: string;
}

export default function ProgressBar({ value, text, title }: ProgressBarProps) {
  return (
    <Section>
      <h2>{title || 'Processing'}</h2>
      <Root value={value}>
        <Indicator style={{ width: `${value}%` }} />
      </Root>
      <Text>{text}</Text>
    </Section>
  );
}
