import React from "react";
import { registerComponent } from "../../lib/vulcan-lib";

const styles = (theme: ThemeType) => ({
  root: {
    display: "inline-block",
    cursor: "pointer",
    userSelect: "none",
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.primary.dark,
  },
});

export const PeopleDirectoryClearAll = ({onClear, classes}: {
  onClear: () => void,
  classes: ClassesType<typeof styles>,
}) => {
  return (
    <div onClick={onClear} className={classes.root}>
      Clear all
    </div>
  );
}

const PeopleDirectoryClearAllComponent = registerComponent(
  "PeopleDirectoryClearAll",
  PeopleDirectoryClearAll,
  {styles},
);

declare global {
  interface ComponentTypes {
    PeopleDirectoryClearAll: typeof PeopleDirectoryClearAllComponent
  }
}
