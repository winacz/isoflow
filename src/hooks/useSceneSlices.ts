import { useScene } from 'src/hooks/useScene';

/**
 * Narrow scene reads — prefer these over full `useScene()` in leaf components
 * so connector path updates do not invalidate unrelated consumers unnecessarily.
 * (Full useScene still returns a large memo object; splitting call sites is step 1.)
 */

export const useSceneItems = () => {
  const { items, currentView } = useScene();
  return { items, currentView };
};

export const useConnectorPaths = () => {
  const { connectors } = useScene();
  return connectors;
};

export const useSceneActions = () => {
  const scene = useScene();
  return {
    createConnector: scene.createConnector,
    updateConnector: scene.updateConnector,
    deleteConnector: scene.deleteConnector,
    createViewItem: scene.createViewItem,
    updateViewItem: scene.updateViewItem,
    deleteViewItem: scene.deleteViewItem,
    beginHistoryTransaction: scene.beginHistoryTransaction,
    endHistoryTransaction: scene.endHistoryTransaction,
    undo: scene.undo
  };
};
