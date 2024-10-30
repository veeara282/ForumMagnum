import React, { useEffect, useState } from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import { SerializedEditorContents, deserializeEditorContents, EditorContents, nonAdminEditors, adminEditors } from './Editor';
import { useCurrentUser } from '../common/withUser';
import { htmlToTextDefault } from '@/lib/htmlToText';

const styles = (theme: ThemeType): JssStyles => ({
  root: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 10,
    fontFamily: theme.typography.commentStyle.fontFamily,
    color: theme.palette.text.primaryAlert,
    fontSize: 14,
    lineHeight: '18px',
    fontWeight: '500',
    padding: '10px 8px',
    borderRadius: 4,
    backgroundColor: theme.palette.background.primaryTranslucent,
    marginBottom: 8,
    
    "& a": {
      '&:hover': {
        color: theme.palette.primary.dark,
        opacity: 1
      }
    }
  },
  restoreLink: {
    color: theme.palette.text.primaryAlert,
    whiteSpace: 'nowrap',
    paddingLeft: 6,
    paddingRight: 2
  },
  restoreBody: {
    color: theme.palette.grey[500],
    maxHeight: '1.5em',
    lineHeight: '1.5em',
    fontSize: '1.1rem',
    overflow: 'hidden',
    padding: '0 4px',
  },
  closeIcon: {
    fontSize: 16,
    cursor: 'pointer',
    marginLeft: 'auto',
    '&:hover': {
      color: theme.palette.primary.dark,
    }
  }
});

type RestorableState = {
  savedDocument: SerializedEditorContents,
}
const restorableStateHasMetadata = (savedState: any) => {
  return typeof savedState === "object"
}
const getRestorableState = (currentUser: UsersCurrent|null, getLocalStorageHandlers: (editorType?: string) => any): RestorableState|null => {
  const editors = currentUser?.isAdmin ? adminEditors : nonAdminEditors
  
  for (const editorType of editors) {
    const savedState = getLocalStorageHandlers(editorType).get();
    if (savedState) {
      if (restorableStateHasMetadata(savedState)) {
        return {
          savedDocument: savedState,
        }
      }
      return {
        savedDocument: {type: editorType, value: savedState}
      }
    }
  }
  return null;
};

const LocalStorageCheck = ({getLocalStorageHandlers, onRestore, classes}: {
  getLocalStorageHandlers: (editorType?: string) => any,
  onRestore: (newState: EditorContents) => void,
  classes: ClassesType,
}) => {
  const [localStorageChecked, setLocalStorageChecked] = useState(false);
  const [restorableState, setRestorableState] = useState<RestorableState|null>(null);
  const currentUser = useCurrentUser();
  
  useEffect(() => {
    if (!localStorageChecked) {
      setLocalStorageChecked(true);
      setRestorableState(getRestorableState(currentUser, getLocalStorageHandlers));
    }
  }, [localStorageChecked, getLocalStorageHandlers, currentUser]);
  
  if (!restorableState)
    return null;
  
  const displayedRestore = htmlToTextDefault(deserializeEditorContents(restorableState.savedDocument)?.value ?? '');

  return <div className={classes.root}>
    <div>
      <a className={classes.restoreLink} onClick={() => {
        setRestorableState(null);
        const restored = deserializeEditorContents(restorableState.savedDocument);
        if (restored) {
          onRestore(restored);
        } else {
          // eslint-disable-next-line no-console
          console.error("Error restoring from localStorage");
        }
      }}>Restore Autosave</a>
    </div>
    <div className={classes.restoreBody}> {displayedRestore} </div>

    <Components.ForumIcon icon="Close" className={classes.closeIcon} onClick={() => setRestorableState(null)}/>
  </div>
}

const LocalStorageCheckComponent = registerComponent('LocalStorageCheck', LocalStorageCheck, {styles});

declare global {
  interface ComponentTypes {
    LocalStorageCheck: typeof LocalStorageCheckComponent
  }
}
