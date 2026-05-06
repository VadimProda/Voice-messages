import styled from "styled-components";

export const MessageBoardContainer = styled.div`
  height: ${({ height }) => height || "100%"};
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  background: #fff;

  .MsgBoard {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    padding: 12px 20px 4px;
  }

  .input-text {
    min-height: 0;
    flex-shrink: 0;
    border-top: 1px solid #e4e7e5;
    background: #fff;
    padding: 8px 20px 10px;
    overflow: visible;
  }

  .input-text .DraftEditor-root {
    max-height: 132px;
    overflow-y: auto;
  }

  .input-text .public-DraftEditor-content {
    min-height: 56px;
  }

  .text-center {
    display: grid;
    place-items: center;
    padding: 20px;
  }

  @media (max-width: 768px) {
    .MsgBoard {
      padding: 8px 12px 4px;
    }

    .input-text {
      padding: 8px 12px 10px;
    }

    .input-text .DraftEditor-root {
      max-height: 112px;
    }

    .input-text .public-DraftEditor-content {
      min-height: 48px;
    }
  }
`;
