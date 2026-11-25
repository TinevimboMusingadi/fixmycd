import { useCallback } from 'react';
import { router, useNavigation } from 'expo-router';

/** Close the whole auth modal (welcome/login/signup/pending) and return to where the user was. */
export function useCloseAuth() {
  const navigation = useNavigation();
  return useCallback(() => {
    const parent = navigation.getParent();
    if (parent?.canGoBack()) parent.goBack();
    else router.replace('/');
  }, [navigation]);
}
